import type { ChatPart } from '@shared/types';
import { truncate } from '@shared/utils/formatters';
import { UI_CONFIG } from '@config/ui.config';

export type ToolCallPart = Extract<ChatPart, { type: 'tool_call' }>;

/** [in-flight, done] verbs for built-in and native provider tools. */
const LABELS: Record<string, [string, string]> = {
  // Meeting tools
  search_meetings: ['Searching meetings', 'Searched meetings'],
  get_meeting: ['Retrieving meeting', 'Retrieved meeting'],
  list_meetings: ['Listing meetings', 'Listed meetings'],
  get_action_items: ['Getting action items', 'Found action items'],
  // Chat history + todo tools
  search_chats: ['Searching chats', 'Searched chats'],
  get_chat: ['Retrieving chat', 'Retrieved chat'],
  list_chats: ['Listing chats', 'Listed chats'],
  manage_todo: ['Drafting todo', 'Drafted todo'],
  // Native provider tools (web search)
  webSearch: ['Searching the web', 'Searched the web'],
  googleSearch: ['Searching the web', 'Searched the web'],
  webSearchPreview: ['Searching the web', 'Searched the web'],
  browserSearch: ['Searching the web', 'Searched the web'],
};

/** "## Meeting: <title>" — the header get_meeting's result starts with. */
const MEETING_HEADER = /^## Meeting: (.+)$/m;

const MS_PER_SECOND = 1000;

function quoted(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return `“${truncate(value.trim(), UI_CONFIG.content.snippetLength)}”`;
}

function upTo(value: unknown, noun: string): string | undefined {
  return typeof value === 'number' ? `(up to ${value} ${noun})` : undefined;
}

function queryDetail(part: ToolCallPart): string | undefined {
  const query = quoted(part.arguments.query);
  return query && `for ${query}`;
}

function meetingDetail(part: ToolCallPart): string | undefined {
  const title = part.result?.content.match(MEETING_HEADER)?.[1];
  return quoted(title ?? part.arguments.meeting_id);
}

/** Argument-derived snippet appended to the verb, per tool. */
const DETAILS: Record<string, (part: ToolCallPart) => string | undefined> = {
  search_meetings: queryDetail,
  search_chats: queryDetail,
  webSearch: queryDetail,
  googleSearch: queryDetail,
  webSearchPreview: queryDetail,
  browserSearch: queryDetail,
  get_meeting: meetingDetail,
  get_action_items: (part) => quoted(part.arguments.meeting_title),
  list_meetings: (part) => upTo(part.arguments.count, 'meetings'),
  list_chats: (part) => upTo(part.arguments.limit, 'chats'),
  manage_todo: (part) => quoted(part.arguments.text),
};

function formatToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ');
}

function builtInTitle(part: ToolCallPart): string {
  const pair = LABELS[part.toolName];
  if (!pair) return part.status === 'calling' ? `Running ${formatToolName(part.toolName)}` : `Used ${formatToolName(part.toolName)}`;
  const verb = part.status === 'calling' ? pair[0] : pair[1];
  const detail = DETAILS[part.toolName]?.(part);
  return detail ? `${verb} ${detail}` : verb;
}

function baseTitle(part: ToolCallPart): string {
  if (part.source) return formatToolName(part.toolName);
  return builtInTitle(part);
}

/** Human title for a tool call: verb + argument for built-ins, `server · tool` for MCP, "failed" on error. */
export function toolCallTitle(part: ToolCallPart): string {
  const prefix = part.source ? `${part.source} · ` : '';
  if (part.status === 'error') return `${prefix}${formatToolName(part.toolName)} failed`;
  const suffix = part.status === 'calling' ? '…' : '';
  return `${prefix}${baseTitle(part)}${suffix}`;
}

/** Execution time as "850ms" / "1.2s". */
export function formatExecutionMs(ms: number): string {
  return ms < MS_PER_SECOND ? `${Math.round(ms)}ms` : `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}
