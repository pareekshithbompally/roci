/** Coding agents section: each agent's registration with optimistic add/remove, and Roci's MCP server state. */

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
  /** Every agent found on this Mac and free to change, added or removed in one step. */
  setAll: (registered: boolean) => void;
  /** An agent's config is being written right now. */
  pending: boolean;
}

/** An agent Roci can add itself to now: installed, nothing in the way. */
export const isAvailable = (agent: CodingAgentStatus): boolean => agent.installed && agent.problem === null;

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
    setAll: (registered) => agents
      .filter((agent) => isAvailable(agent) && (registered ? agent.registration !== 'current' : agent.registration !== 'none'))
      .forEach((agent) => mutation.mutate({ id: agent.id, registered })),
    pending: mutation.isPending,
  };
}
