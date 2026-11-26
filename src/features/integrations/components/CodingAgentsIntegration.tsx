/** Coding agents: Roci's MCP server on its own, then one block that adds Roci to every agent found on this Mac, with the
 *  command for any other agent. */

import React from 'react';
import { Copy } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { Button, CardRow, Code, IconButton, IconTile, Section, Status, Switch, Text, markGlyph } from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { copyRichText } from '@shared/utils/clipboard';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { isAvailable, useCodingAgents } from '@features/integrations/hooks/useCodingAgents';
import type { CodingAgentStatus, McpHostStatus } from '@services/mcpHost.service';

const COPY = INTEGRATIONS_CONFIG.codingAgents;
const ALL = COPY.all;
/** Every supported agent's mark as a one-colour glyph, in config order. */
const AGENT_MARKS = Object.entries(COPY.agents).map(([id, agent]) => ({ id, title: agent.title, Glyph: markGlyph(agent.mark) }));

export const CodingAgentsIntegration: React.FC = () => {
  const { agents, server, setAll, pending } = useCodingAgents();
  return (
    <>
      <Section footer={COPY.server.description}>
        <CardRow
          leading={<IconTile icon={SiModelcontextprotocol} />}
          title={COPY.server.title}
          description={server?.error ?? <ServerStatus server={server} />}
        />
      </Section>
      <Section title={<AgentMarks />}>
        <AgentsRow agents={agents.filter(isAvailable)} pending={pending} setAll={setAll} />
        <ManualSetupRow server={server} />
      </Section>
    </>
  );
};

const ServerStatus: React.FC<{ server: McpHostStatus | undefined }> = ({ server }) => {
  if (!server?.listening || !server.ready) return <Status state="preparing">{COPY.server.starting}</Status>;
  if (server.clients > 0) return <Status state="ready">{COPY.server.connected(server.clients)}</Status>;
  return <Status state="ready">{COPY.server.ready}</Status>;
};

/** "Claude Code, Codex and OpenCode". */
function namesOf(agents: CodingAgentStatus[]): string {
  const names = agents.map((agent) => COPY.agents[agent.id].title);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/** The supported agents' marks side by side on the page, heading the agents' card, in the text's muted colour. */
const AgentMarks: React.FC = () => (
  <Text tone="muted" className="flex items-center gap-3">
    {AGENT_MARKS.map(({ id, title, Glyph }) => <span key={id} title={title} className="inline-flex"><Glyph /></span>)}
  </Text>
);

interface AgentsRowProps {
  agents: CodingAgentStatus[];
  pending: boolean;
  setAll: (registered: boolean) => void;
}

/** One switch for every available agent: on once Roci is added to any of them; Update when an entry points at a moved Roci. */
const AgentsRow: React.FC<AgentsRowProps> = ({ agents, pending, setAll }) => {
  const on = agents.some((agent) => agent.registration !== 'none');
  const outdated = agents.some((agent) => agent.registration === 'outdated');
  const names = namesOf(agents);
  const description = agents.length === 0 ? ALL.none : outdated ? COPY.outdated.description : on ? ALL.on(names) : ALL.off(names);
  return (
    <CardRow
      title={ALL.title}
      description={description}
      status={outdated && <Button variant="outline" size="sm" loading={pending} onClick={() => setAll(true)}>{COPY.outdated.action}</Button>}
      actions={<Switch checked={on} disabled={agents.length === 0 || pending} onCheckedChange={setAll} aria-label={ALL.label} />}
    />
  );
};

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
          <Code line>{command}</Code>
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
