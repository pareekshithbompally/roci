import { isToolUIPart } from 'ai';
import type { ChatPart } from '@shared/types';
import { generatedImageOf } from '@shared/utils/chatParts';
import { toolCallView, type ToolCallView } from '@features/chat/components/tool-call';
import type { ChatMedia } from '@features/chat/components/MediaPartRenderer';

/** The model's work before it answers: thinking and tool calls. */
export type ActivityPart = { type: 'reasoning'; text: string } | ToolCallView;

/** A part with its place in the message. */
export interface IndexedPart<P> {
  part: P;
  index: number;
}

/** A message's parts as shown, in order; work done back to back is one run. */
export type PartSegment =
  | { kind: 'activity'; items: IndexedPart<ActivityPart>[] }
  | { kind: 'text'; item: IndexedPart<string> }
  | { kind: 'media'; item: IndexedPart<ChatMedia> };

/** Separates thinking blocks streamed back to back (OpenAI sends each reasoning summary as its own block). */
const REASONING_BLOCK_BREAK = '\n\n';

function addActivity(segments: PartSegment[], item: IndexedPart<ActivityPart>): void {
  const last = segments.at(-1);
  if (last?.kind === 'activity') last.items.push(item);
  else segments.push({ kind: 'activity', items: [item] });
}

/** A thinking block right after another is one row, as the model thought it. */
function addReasoning(segments: PartSegment[], text: string, index: number): void {
  const last = segments.at(-1);
  const previous = last?.kind === 'activity' ? last.items.at(-1) : undefined;
  if (previous?.part.type !== 'reasoning') {
    addActivity(segments, { part: { type: 'reasoning', text }, index });
    return;
  }
  previous.part = { type: 'reasoning', text: [previous.part.text, text].filter(Boolean).join(REASONING_BLOCK_BREAK) };
  previous.index = index;
}

/** One part into the segments; parts the screen doesn't show (step starts, sources, data for the model) add nothing. */
function addPart(segments: PartSegment[], part: ChatPart, index: number): void {
  if (part.type === 'reasoning') {
    addReasoning(segments, part.text, index);
  } else if (part.type === 'text') {
    segments.push({ kind: 'text', item: { part: part.text, index } });
  } else if (part.type === 'file') {
    segments.push({ kind: 'media', item: { part, index } });
  } else if (isToolUIPart(part)) {
    addActivity(segments, { part: toolCallView(part), index });
    // An image the tool made shows right after its row.
    const image = generatedImageOf(part);
    if (image) segments.push({ kind: 'media', item: { part: image, index } });
  }
}

export function groupActivity(parts: readonly ChatPart[]): PartSegment[] {
  const segments: PartSegment[] = [];
  parts.forEach((part, index) => addPart(segments, part, index));
  return segments;
}

/** The newest shown part's index: while the reply streams, the step under way. */
export function liveIndexOf(segments: PartSegment[]): number | null {
  const last = segments.at(-1);
  if (!last) return null;
  return last.kind === 'activity' ? (last.items.at(-1)?.index ?? null) : last.item.index;
}
