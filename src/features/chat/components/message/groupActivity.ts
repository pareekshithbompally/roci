import type { ChatPart } from '@shared/types';

/** The model's work before it answers: thinking and tool calls. */
export type ActivityPart = Extract<ChatPart, { type: 'reasoning' | 'tool_call' }>;

/** A part with its place in the message. */
export interface IndexedPart<P extends ChatPart> {
  part: P;
  index: number;
}

/** A message's parts in order; work done back to back is one run. */
export type PartSegment =
  | { kind: 'activity'; items: IndexedPart<ActivityPart>[] }
  | { kind: 'part'; item: IndexedPart<Exclude<ChatPart, ActivityPart>> };

const isActivity = (part: ChatPart): part is ActivityPart => part.type === 'reasoning' || part.type === 'tool_call';

export function groupActivity(parts: ChatPart[]): PartSegment[] {
  const segments: PartSegment[] = [];
  parts.forEach((part, index) => {
    const last = segments[segments.length - 1];
    if (!isActivity(part)) {
      segments.push({ kind: 'part', item: { part, index } });
    } else if (last?.kind === 'activity') {
      last.items.push({ part, index });
    } else {
      segments.push({ kind: 'activity', items: [{ part, index }] });
    }
  });
  return segments;
}
