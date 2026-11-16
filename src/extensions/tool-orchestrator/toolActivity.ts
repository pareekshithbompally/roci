/** Stream tool events → ToolActivity; the only code that knows the shape of providers' built-in tool output. */

import type { TextStreamPart, ToolSet } from 'ai';
import type { ToolResult } from '@extensions/tools/types';
import { errorMessage } from '@shared/utils/errors';
import type { ToolActivity, ToolOutcome } from './types';

type Args = Record<string, unknown>;

/** Tool name → the MCP server it came from. */
export type ToolSources = ReadonlyMap<string, string>;

/** A built-in tool's details and its summary line(s). */
interface BuiltInOutput {
  arguments?: Args;
  content: string;
}

function isRecord(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolResult(value: unknown): value is ToolResult {
  return isRecord(value) && typeof value.content === 'string' && typeof value.isError === 'boolean';
}

/** One line per web result: its title and URL, or just the URL. */
function resultLines(results: unknown[]): string {
  return results
    .filter(isRecord)
    .map((r) => (typeof r.title === 'string' && r.title ? `${r.title} · ${r.url}` : String(r.url)))
    .join('\n');
}

/** OpenAI web search: `{ action: search | openPage | findInPage, sources? }`. */
function openAiAction(action: Args, sources: unknown): BuiltInOutput | null {
  switch (action.type) {
    case 'search':
      return {
        arguments: { query: action.query, ...(Array.isArray(action.queries) && { queries: action.queries }) },
        content: Array.isArray(sources) ? resultLines(sources) : '',
      };
    case 'openPage':
      return { arguments: { url: action.url }, content: String(action.url) };
    case 'findInPage':
      return { arguments: { url: action.url, pattern: action.pattern }, content: `“${action.pattern}” in ${action.url}` };
    default:
      return null;
  }
}

/** A built-in tool's output: OpenAI's action record, or Anthropic's list of results. */
function builtInOutput(output: unknown): BuiltInOutput {
  if (Array.isArray(output)) return { content: resultLines(output) };
  if (isRecord(output) && isRecord(output.action)) return openAiAction(output.action, output.sources) ?? { content: '' };
  return { content: '' };
}

/** Error text from a thrown error or a provider's error record (`{ errorCode }`, `{ status }`). */
function errorText(error: unknown): string {
  if (!isRecord(error) || error instanceof Error) return errorMessage(error);
  const code = error.errorCode ?? error.status;
  return code === undefined ? JSON.stringify(error) : `Failed (${String(code)})`;
}

type Identity = Pick<ToolActivity, 'toolCallId' | 'toolName' | 'source'>;

function endOf(part: Extract<TextStreamPart<ToolSet>, { type: 'tool-result' }>, id: Identity): ToolActivity {
  const { output } = part;
  if (!part.providerExecuted && isToolResult(output)) {
    const { content, isError, meta } = output;
    const result: ToolOutcome = { content, isError, executionMs: meta?.executionMs, citations: meta?.citations };
    return { ...id, phase: 'end', result };
  }
  const { arguments: args, content } = builtInOutput(output);
  return { ...id, phase: 'end', ...(args && { arguments: args }), result: { content, isError: false } };
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
    case 'tool-error':
      return {
        ...identityOf(part.toolCallId, part.toolName, sources),
        phase: 'end',
        result: { content: errorText(part.error), isError: true },
      };
    default:
      return null;
  }
}
