/** Stream tool events → ToolActivity: data only (the UI words it); the only code that knows providers' built-in tool output. */

import type { TextStreamPart, ToolSet } from 'ai';
import type { ToolResult } from '@extensions/tools/types';
import { errorMessage } from '@shared/utils/errors';
import { isRecord } from '@shared/utils/validators';
import type { ToolActivity, ToolOutcome } from './types';

type Args = Record<string, unknown>;

/** Tool name → the MCP server it came from. */
export type ToolSources = ReadonlyMap<string, string>;

type Identity = Pick<ToolActivity, 'toolCallId' | 'toolName' | 'source'>;

/** The fields of OpenAI's web search action that say what it did (`search`, `openPage`, `findInPage`). */
const ACTION_FIELDS = ['query', 'queries', 'url', 'pattern'] as const;

function isToolResult(value: unknown): value is ToolResult {
  return isRecord(value) && typeof value.content === 'string' && typeof value.isError === 'boolean';
}

function hasText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}

/** What a built-in search did, from OpenAI's `action`; fields the provider left empty are left out. */
function actionArguments(output: unknown): Args | undefined {
  if (!isRecord(output) || !isRecord(output.action)) return undefined;
  const { action } = output;
  const args = Object.fromEntries(ACTION_FIELDS.filter((key) => hasText(action[key])).map((key) => [key, action[key]]));
  return Object.keys(args).length > 0 ? args : undefined;
}

/** Anthropic's results carry encrypted page content; only their title and URL are readable. */
function readable(output: unknown): unknown {
  if (!Array.isArray(output)) return output;
  return output.filter(isRecord).map(({ title, url }) => ({ ...(hasText(title) && { title }), url }));
}

/** A value as the text a tool row shows: strings as they are, anything else as JSON. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

function endOf(part: Extract<TextStreamPart<ToolSet>, { type: 'tool-result' }>, id: Identity): ToolActivity {
  const { output } = part;
  if (!part.providerExecuted && isToolResult(output)) {
    const { content, isError, meta } = output;
    const result: ToolOutcome = { content, isError, executionMs: meta?.executionMs, citations: meta?.citations };
    return { ...id, phase: 'end', result };
  }
  const args = actionArguments(output);
  return { ...id, phase: 'end', ...(args && { arguments: args }), result: { content: asText(readable(output)), isError: false } };
}

function identityOf(toolCallId: string, toolName: string, sources: ToolSources): Identity {
  const source = sources.get(toolName);
  return { toolCallId, toolName, ...(source && { source }) };
}

/** One stream event → its tool activity; null for events that aren't about a tool. */
export function toolActivityOf(part: TextStreamPart<ToolSet>, sources: ToolSources): ToolActivity | null {
  switch (part.type) {
    case 'tool-input-start':
      return { ...identityOf(part.id, part.toolName, sources), phase: 'start' };
    case 'tool-call':
      return {
        ...identityOf(part.toolCallId, part.toolName, sources),
        phase: 'input',
        arguments: isRecord(part.input) ? part.input : {},
      };
    case 'tool-result':
      return endOf(part, identityOf(part.toolCallId, part.toolName, sources));
    case 'tool-error': {
      const content = part.error instanceof Error ? errorMessage(part.error) : asText(part.error);
      return { ...identityOf(part.toolCallId, part.toolName, sources), phase: 'end', result: { content, isError: true } };
    }
    default:
      return null;
  }
}
