/** Reads a chat message's SDK parts: its text, what its tools returned (citations, an image, a screen or view), its web sources. */

import { getToolName, isTextUIPart, isToolUIPart } from 'ai';
import type { ChatMessage, ChatPart, GeneratedImage, MeetingCitation, WebCitation } from '@shared/types';
import type { ToolResult, ToolView } from '@extensions/tools/types';
import { isRecord } from '@shared/utils/validators';
import { ATTACHMENT_TYPES } from '@config/chat.config';
import type { Modality } from '@config/modelSpine.config';

/** The kinds of media a message shows, from a file's media type. */
export type MediaKind = 'image' | 'audio' | 'video' | 'document';

export function mediaKind(mediaType: string): MediaKind {
  const [kind] = mediaType.split('/');
  return kind === 'image' || kind === 'audio' || kind === 'video' ? kind : 'document';
}

const hasExtension = (filename: string, extensions: readonly string[]) =>
  extensions.some((extension) => filename.toLowerCase().endsWith(extension));

/** The media type an attachment is kept with: a PDF as a PDF even when the system named no type, so the viewer and the
 *  model read it as one; any other as given (an unknown type as raw bytes). */
export function attachmentMediaType(mediaType: string, filename: string): string {
  if (attachmentInput(mediaType, filename) === 'pdf') return ATTACHMENT_TYPES.pdf.mediaType;
  return mediaType || 'application/octet-stream';
}

/** What a model must take to read an attached file: images, audio, video or PDFs; `text` for a text file (sent as its
 *  contents, which every model reads); null for a file no model reads (a Word document, an archive). */
export function attachmentInput(mediaType: string, filename = ''): Modality | null {
  const kind = mediaKind(mediaType);
  if (kind !== 'document') return kind;
  const { pdf, text } = ATTACHMENT_TYPES;
  if (mediaType === pdf.mediaType || hasExtension(filename, [pdf.extension])) return 'pdf';
  const textType = mediaType.startsWith(text.mediaTypePrefix) || (text.mediaTypes as readonly string[]).includes(mediaType);
  return textType || hasExtension(filename, text.extensions) ? 'text' : null;
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

/** What shows right after a tool's row: the image it made, the screen its MCP server declared, or the view `show` drew;
 *  null when it shows nothing beyond its row. */
export function toolViewOf(part: ChatPart): ToolView | null {
  const meta = toolResultOf(part)?.meta;
  if (!meta || !isToolUIPart(part)) return null;
  if (meta.image) return { kind: 'image', image: meta.image };
  if (meta.app) return { kind: 'app', app: meta.app, title: getToolName(part) };
  return meta.view ?? null;
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
