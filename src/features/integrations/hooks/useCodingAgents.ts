/** Coding agents section: each agent's registration with optimistic add/remove, and Kasset's MCP server state. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@services/tauri';
import { mcpHostService } from '@services/mcpHost.service';
import type { CodingAgentId, CodingAgentStatus, McpHostStatus } from '@services/mcpHost.service';
import { errorMessage } from '@shared/utils/errors';

interface SetVars {
  id: CodingAgentId;
  registered: boolean;
}

export interface CodingAgents {
  agents: CodingAgentStatus[];
  server: McpHostStatus | undefined;
  setRegistered: (id: CodingAgentId, registered: boolean) => void;
  /** The agent whose config is being written right now. */
  pendingId: CodingAgentId | null;
}

export function useCodingAgents(): CodingAgents {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const key = queryKeys.codingAgents();
  const enabled = isTauriEnvironment();

  const { data: agents = [] } = useQuery({ queryKey: key, queryFn: mcpHostService.agents, enabled });
  const { data: server } = useQuery({ queryKey: queryKeys.mcpHost(), queryFn: mcpHostService.status, enabled });

  const mutation = useMutation({
    mutationFn: ({ id, registered }: SetVars) => mcpHostService.setAgent(id, registered),
    onMutate: async ({ id, registered }: SetVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CodingAgentStatus[]>(key);
      queryClient.setQueryData<CodingAgentStatus[]>(key, (old) =>
        old?.map((agent) => (agent.id === id ? { ...agent, registration: registered ? 'current' : 'none' } : agent)),
      );
      return { previous };
    },
    onError: (error: unknown, _vars, context) => {
      queryClient.setQueryData(key, context?.previous);
      showToast(errorMessage(error), 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    agents,
    server,
    setRegistered: (id, registered) => mutation.mutate({ id, registered }),
    pendingId: mutation.isPending ? mutation.variables.id : null,
  };
}
