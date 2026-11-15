import type { ChatPart } from '@shared/types';
import type { ToolCallPart } from './toolCallTitle';

/** A message's parts in order, with calls made back to back gathered together. */
export type PartSegment =
  | { kind: 'tools'; parts: ToolCallPart[] }
  | { kind: 'part'; part: Exclude<ChatPart, ToolCallPart>; index: number };

export function groupToolCalls(parts: ChatPart[]): PartSegment[] {
  const segments: PartSegment[] = [];
  parts.forEach((part, index) => {
    const last = segments[segments.length - 1];
    if (part.type !== 'tool_call') {
      segments.push({ kind: 'part', part, index });
    } else if (last?.kind === 'tools') {
      last.parts.push(part);
    } else {
      segments.push({ kind: 'tools', parts: [part] });
    }
  });
  return segments;
}
