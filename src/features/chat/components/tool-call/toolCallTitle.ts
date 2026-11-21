import { toolKey, type ToolCallView } from './toolCallView';
import { truncate } from '@shared/utils/formatters';
import { extractDomain } from '@shared/utils/citationUtils';
import { UI_CONFIG } from '@config/ui.config';

/** [in-flight, done] verbs for built-in and native provider tools, by `toolKey`. */
const LABELS: Record<string, [string, string]> = {
  'find.meetings': ['Searching meetings', 'Searched meetings'],
  'find.meetings.list': ['Listing meetings', 'Listed meetings'],
  'find.chats': ['Searching chats', 'Searched chats'],
  'find.chats.list': ['Listing chats', 'Listed chats'],
  'find.todos': ['Searching to-dos', 'Searched to-dos'],
  'find.todos.list': ['Reading to-dos', 'Read to-dos'],
  'find.memories': ['Searching memories', 'Searched memories'],
  'find.memories.list': ['Reading memories', 'Read memories'],
  'find.knowledge': ['Searching knowledge', 'Searched knowledge'],
  'find.knowledge.list': ['Reading knowledge', 'Read knowledge'],
  'read.meeting': ['Retrieving meeting', 'Retrieved meeting'],
  'read.chat': ['Retrieving chat', 'Retrieved chat'],
  'read.entity': ['Looking up', 'Looked up'],
  'suggest_todo.add': ['Drafting to-do', 'Drafted to-do'],
  'suggest_todo.update': ['Drafting to-do change', 'Drafted to-do change'],
  'suggest_todo.delete': ['Drafting to-do removal', 'Drafted to-do removal'],
  'suggest_memory.save': ['Drafting memory', 'Drafted memory'],
  'suggest_memory.forget': ['Drafting memory removal', 'Drafted memory removal'],
  // Native provider tools (web search)
  webSearch: ['Searching the web', 'Searched the web'],
  googleSearch: ['Searching the web', 'Searched the web'],
  webSearchPreview: ['Searching the web', 'Searched the web'],
  browserSearch: ['Searching the web', 'Searched the web'],
};

/** "## Meeting: <title>" — the header a meeting's read starts with. */
const MEETING_HEADER = /^## Meeting: (.+)$/m;

const MS_PER_SECOND = 1000;

function quoted(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return `“${truncate(value.trim(), UI_CONFIG.content.snippetLength)}”`;
}

function upTo(value: unknown, noun: string): string | undefined {
  return typeof value === 'number' ? `(up to ${value} ${noun})` : undefined;
}

function queryDetail(part: ToolCallView): string | undefined {
  const query = quoted(part.arguments.query);
  return query && `for ${query}`;
}

/** A web search: what it searched for, or the site it read when it opened a page. */
function webDetail(part: ToolCallView): string | undefined {
  const { url } = part.arguments;
  return queryDetail(part) ?? (typeof url === 'string' && url ? `on ${extractDomain(url)}` : undefined);
}

function meetingDetail(part: ToolCallView): string | undefined {
  const title = part.result?.content.match(MEETING_HEADER)?.[1];
  return quoted(title ?? part.arguments.meeting_id);
}

/** Argument-derived snippet appended to the verb, by `toolKey`. */
const DETAILS: Record<string, (part: ToolCallView) => string | undefined> = {
  'find.meetings': queryDetail,
  'find.chats': queryDetail,
  'find.todos': queryDetail,
  'find.memories': queryDetail,
  'find.knowledge': queryDetail,
  webSearch: webDetail,
  googleSearch: webDetail,
  webSearchPreview: webDetail,
  browserSearch: webDetail,
  'read.meeting': meetingDetail,
  'find.meetings.list': (part) => upTo(part.arguments.limit, 'meetings'),
  'find.chats.list': (part) => upTo(part.arguments.limit, 'chats'),
  'suggest_todo.add': (part) => quoted(part.arguments.text),
  'suggest_todo.update': (part) => quoted(part.arguments.text),
  'suggest_memory.save': (part) => quoted(part.arguments.text),
};

/** A tool's name to read: an MCP server tool without its `server:` prefix, words for underscores ("search meetings"). */
export function formatToolName(toolName: string): string {
  return toolName.replace(/^server:/, '').replace(/_/g, ' ');
}

function builtInTitle(part: ToolCallView): string {
  const key = toolKey(part);
  const pair = LABELS[key];
  if (!pair) return part.status === 'calling' ? `Running ${formatToolName(part.toolName)}` : `Used ${formatToolName(part.toolName)}`;
  const verb = part.status === 'calling' ? pair[0] : pair[1];
  const detail = DETAILS[key]?.(part);
  return detail ? `${verb} ${detail}` : verb;
}

function baseTitle(part: ToolCallView): string {
  if (part.source) return formatToolName(part.toolName);
  return builtInTitle(part);
}

/** Human title for a tool call: verb + argument for built-ins, `server · tool` for MCP, "failed" on error. */
export function toolCallTitle(part: ToolCallView): string {
  const prefix = part.source ? `${part.source} · ` : '';
  if (part.status === 'error') return `${prefix}${part.source ? formatToolName(part.toolName) : LABELS[toolKey(part)]?.[0] ?? formatToolName(part.toolName)} failed`;
  const suffix = part.status === 'calling' ? '…' : '';
  return `${prefix}${baseTitle(part)}${suffix}`;
}

/** Execution time as "850ms" / "1.2s". */
export function formatExecutionMs(ms: number): string {
  return ms < MS_PER_SECOND ? `${Math.round(ms)}ms` : `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}
