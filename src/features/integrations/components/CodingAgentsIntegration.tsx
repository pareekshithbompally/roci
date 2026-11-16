/** Coding agents rows: Kasset's MCP server, one switch per agent's `kasset` config entry, then a manual command. */

import React from 'react';
import { Copy, SquareTerminal } from 'lucide-react';
import { Button, CardRow, Code, Icon, IconButton, Status, Switch } from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { copyRichText } from '@shared/utils/clipboard';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useCodingAgents } from '@features/integrations/hooks/useCodingAgents';
import type { CodingAgentStatus, McpHostStatus } from '@services/mcpHost.service';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.codingAgents;

export const CodingAgentsIntegration: React.FC = () => {
  const { agents, server, setRegistered, pendingId } = useCodingAgents();
  return (
    <>
      <CardRow
        leading={<Icon icon={SquareTerminal} size="sm" />}
        title={COPY.server.title}
        description={server?.error ?? COPY.server.description}
        status={<ServerStatus server={server} />}
      />
      {agents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          pending={pendingId === agent.id}
          setRegistered={(on) => setRegistered(agent.id, on)}
        />
      ))}
      <ManualSetupRow server={server} />
    </>
  );
};

const ServerStatus: React.FC<{ server: McpHostStatus | undefined }> = ({ server }) => {
  if (server?.error) return null;
  if (!server?.listening || !server.ready) return <Status tone="muted">{COPY.server.starting}</Status>;
  if (server.clients > 0) return <Status tone="success">{COPY.server.connected(server.clients)}</Status>;
  return <Status tone="success">{COPY.server.ready}</Status>;
};

interface AgentRowProps {
  agent: CodingAgentStatus;
  pending: boolean;
  setRegistered: (on: boolean) => void;
}

const AgentRow: React.FC<AgentRowProps> = ({ agent, pending, setRegistered }) => {
  const copy = COPY.agents[agent.id];
  const blocked = agent.problem !== null || !agent.installed;
  return (
    <CardRow
      leading={<IntegrationIcon src={copy.icon} />}
      title={copy.title}
      description={describe(agent)}
      status={agent.registration === 'outdated' && (
        <Button variant="outline" size="sm" loading={pending} onClick={() => setRegistered(true)}>{COPY.outdated.action}</Button>
      )}
      actions={
        <Switch
          size="sm"
          checked={agent.registration !== 'none'}
          disabled={blocked || pending}
          onCheckedChange={setRegistered}
          aria-label={`Use Kasset in ${copy.title}`}
        />
      }
    />
  );
};

/** One line that says what's true now: why it can't switch, or what being on means. */
function describe(agent: CodingAgentStatus): string {
  if (agent.problem) return agent.problem;
  if (!agent.installed) return COPY.notInstalled;
  if (agent.registration === 'outdated') return COPY.outdated.description;
  if (agent.registration === 'current') return COPY.added;
  return COPY.agents[agent.id].description;
}

const ManualSetupRow: React.FC<{ server: McpHostStatus | undefined }> = ({ server }) => {
  const { showToast } = useToast();
  if (!server?.command) return null;
  const command = [quote(server.command), ...server.args].join(' ');
  const copy = () => {
    copyRichText(command)
      .then(() => showToast(COPY.manual.copied, 'success'))
      .catch((e: unknown) => console.error('[CodingAgentsIntegration] copy failed:', e));
  };
  return (
    <CardRow
      stacked
      title={COPY.manual.title}
      description={COPY.manual.description}
      actions={
        <>
          <Code className="break-all">{command}</Code>
          <IconButton icon={Copy} label={COPY.manual.copy} size="sm" onClick={copy} />
        </>
      }
    />
  );
};

/** Quote a path with spaces for pasting into a shell or config. */
function quote(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}
