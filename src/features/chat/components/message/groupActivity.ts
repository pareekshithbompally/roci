import { isToolUIPart } from 'ai';
import type { ChatPart } from '@shared/types';
import { isShownPart, toolViewOf } from '@shared/utils/chatParts';
import type { ToolView } from '@extensions/tools/types';
import { toolCallView, type ToolCallView } from '@features/chat/components/tool-call';

/** The model's work before it answers: thinking and tool calls. */
export type ActivityPart = { type: 'reasoning'; text: string } | ToolCallView;

/** What one row shows, the newest part it covers (`index`, the live step while streaming), and its first part (`key`,
 *  so a row keeps its open state as blocks join it). */
export interface IndexedPart<P> {
  part: P;
  index: number;
  key: number;
}

/** A message's parts as shown, in order; work done back to back is one run. */
export type PartSegment =
  | { kind: 'activity'; items: IndexedPart<ActivityPart>[] }
  | { kind: 'text'; item: IndexedPart<string> }
  | { kind: 'view'; item: IndexedPart<ToolView> };

/** Separates thinking blocks streamed back to back (OpenAI sends each reasoning summary as its own block). */
const REASONING_BLOCK_BREAK = '\n\n';

const at = <P>(part: P, index: number): IndexedPart<P> => ({ part, index, key: index });

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
    addActivity(segments, at({ type: 'reasoning', text }, index));
    return;
  }
  previous.part = { type: 'reasoning', text: `${previous.part.text}${REASONING_BLOCK_BREAK}${text}` };
  previous.index = index;
}

/** Text blocks back to back are one answer (Anthropic opens a block per cited claim). */
function addText(segments: PartSegment[], text: string, index: number): void {
  const last = segments.at(-1);
  if (last?.kind !== 'text') {
    segments.push({ kind: 'text', item: at(text, index) });
    return;
  }
  last.item.part += text;
  last.item.index = index;
}

/** One part into the segments; only what `isShownPart` shows adds anything. A file the model made itself isn't shown (it
 *  would bypass the asset store); a tool's image is. */
function addPart(segments: PartSegment[], part: ChatPart, index: number): void {
  if (!isShownPart(part)) return;
  if (part.type === 'reasoning') {
    addReasoning(segments, part.text, index);
  } else if (part.type === 'text') {
    addText(segments, part.text, index);
  } else if (isToolUIPart(part)) {
    addActivity(segments, at(toolCallView(part), index));
    // What the tool made (an image, a screen, a chart…) shows right after its row.
    const view = toolViewOf(part);
    if (view) segments.push({ kind: 'view', item: at(view, index) });
  }
}

export function groupActivity(parts: readonly ChatPart[]): PartSegment[] {
  const segments: PartSegment[] = [];
  parts.forEach((part, index) => addPart(segments, part, index));
  return segments;
}

/** The step under way while the reply streams: the newest shown part; none once what a tool made closed its step. */
export function liveIndexOf(segments: PartSegment[]): number | null {
  const last = segments.at(-1);
  if (!last || last.kind === 'view') return null;
  return last.kind === 'activity' ? (last.items.at(-1)?.index ?? null) : last.item.index;
}
