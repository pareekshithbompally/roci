/** An SDK tool part → its row in the chat; the only code that knows providers' built-in tool output (web search). */

import { getToolName } from 'ai';
import type { ChatToolPart } from '@shared/types';
import { TOOL_RESULT_PREVIEW_CHARS } from '@config/chat.config';
import { toolResultOf } from '@shared/utils/chatParts';
import { isRecord } from '@shared/utils/validators';

type Args = Record<string, unknown>;

/** A tool's row: Roci's own tools, MCP tools, and providers' built-in ones (web search). */
export interface ToolCallView {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  /** MCP server that ran the tool; absent for built-in tools. */
  source?: string;
  arguments: Args;
  status: 'calling' | 'complete' | 'error';
  result?: { content: string; isError: boolean; executionMs?: number };
}

/** The fields of OpenAI's web search action that say what it did (`search`, `openPage`, `findInPage`). */
const ACTION_FIELDS = ['query', 'queries', 'url', 'pattern'] as const;

function hasText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}

/** What a built-in search did, from OpenAI's `action`; fields the provider left empty are left out. */
function actionArguments(output: unknown): Args {
  if (!isRecord(output) || !isRecord(output.action)) return {};
  const { action } = output;
  return Object.fromEntries(ACTION_FIELDS.filter((key) => hasText(action[key])).map((key) => [key, action[key]]));
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

const preview = (content: string): string => content.slice(0, TOOL_RESULT_PREVIEW_CHARS);

/** What the row shows once the tool has answered: Roci's result as it is, a provider's output as readable text. */
function resultOf(part: ChatToolPart): ToolCallView['result'] {
  if (part.state === 'output-error') return { content: preview(part.errorText), isError: true };
  if (part.state === 'output-denied') return { content: part.approval.reason ?? '', isError: true };
  if (part.state !== 'output-available') return undefined;
  const own = toolResultOf(part);
  if (own) return { content: preview(own.content), isError: own.isError, executionMs: own.meta?.executionMs };
  return { content: preview(asText(readable(part.output))), isError: false };
}

function statusOf(result: ToolCallView['result']): ToolCallView['status'] {
  if (!result) return 'calling';
  return result.isError ? 'error' : 'complete';
}

export function toolCallView(part: ChatToolPart): ToolCallView {
  const input = isRecord(part.input) ? part.input : {};
  const result = resultOf(part);
  const source = part.toolMetadata?.source;
  return {
    type: 'tool_call',
    toolCallId: part.toolCallId,
    toolName: getToolName(part),
    ...(typeof source === 'string' && { source }),
    arguments: part.providerExecuted && part.state === 'output-available' ? { ...input, ...actionArguments(part.output) } : input,
    status: statusOf(result),
    result,
  };
}
