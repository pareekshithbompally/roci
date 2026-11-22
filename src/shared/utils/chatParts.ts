/** Reads a chat message's SDK parts: its text, what its tools returned (citations, a generated image), its web sources. */

import { isTextUIPart, isToolUIPart } from 'ai';
import type { ChatMessage, ChatPart, GeneratedImage, MeetingCitation, WebCitation } from '@shared/types';
import type { McpAppMeta, ToolResult } from '@extensions/tools/types';
import { isRecord } from '@shared/utils/validators';

/** The kinds of media a message shows, from a file's media type. */
export type MediaKind = 'image' | 'audio' | 'video' | 'document';

export function mediaKind(mediaType: string): MediaKind {
  const [kind] = mediaType.split('/');
  return kind === 'image' || kind === 'audio' || kind === 'video' ? kind : 'document';
}

/** A part the reply shows: words, thinking or a tool call; the empty blocks some providers open (Gemini's signed text,
 *  OpenAI's reasoning with no summary) show nothing. */
export function isShownPart(part: ChatPart): boolean {
  if (part.type === 'text' || part.type === 'reasoning') return part.text.length > 0;
  return isToolUIPart(part);
}

/** A message's words: its text parts joined. */
export function messageText(message: Pick<ChatMessage, 'parts'>): string {
  return message.parts.filter(isTextUIPart).map((part) => part.text).join('');
}

function isToolResult(value: unknown): value is ToolResult {
  return isRecord(value) && typeof value.content === 'string' && typeof value.isError === 'boolean';
}

/** What one of Roci's tools returned (text, failure, its UI-only meta); null for other parts and provider tools. */
export function toolResultOf(part: ChatPart): ToolResult | null {
  if (!isToolUIPart(part) || part.state !== 'output-available' || part.providerExecuted) return null;
  return isToolResult(part.output) ? part.output : null;
}

/** The image a tool made, shown right after its row; null when the part made none. */
export function generatedImageOf(part: ChatPart): GeneratedImage | null {
  return toolResultOf(part)?.meta?.image ?? null;
}

/** The MCP App screen a tool declared, shown right after its row; null when it has none. */
export function mcpAppOf(part: ChatPart): McpAppMeta | null {
  return toolResultOf(part)?.meta?.app ?? null;
}

/** The meetings a message's tools cited, each meeting once with its best-scoring excerpt. */
export function meetingCitationsOf(parts: readonly ChatPart[]): MeetingCitation[] {
  const best = new Map<string, MeetingCitation>();
  for (const citation of parts.flatMap((part) => toolResultOf(part)?.meta?.citations ?? [])) {
    const kept = best.get(citation.meetingId);
    if (!kept || citation.score > kept.score) best.set(citation.meetingId, citation);
  }
  return [...best.values()];
}

/** The web pages a reply's search used, each URL once, in the order they arrived. */
export function webCitationsOf(parts: readonly ChatPart[]): WebCitation[] {
  const byUrl = new Map<string, WebCitation>();
  for (const part of parts) {
    if (part.type === 'source-url' && !byUrl.has(part.url)) byUrl.set(part.url, { url: part.url, title: part.title ?? '' });
  }
  return [...byUrl.values()];
}
