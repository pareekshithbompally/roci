/** Streaming message store; text and thinking deltas batch per animation frame so only the streaming message re-renders. */

import { create } from 'zustand';
import type { ChatPart, ToolCallPart } from '@shared/types';
import type { GenerationStats } from '@services/ai/types';

export interface StreamingSnapshot {
  parts: ChatPart[];
  msgId: string | null;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation: GenerationStats | null;
}

/** The streamed kinds of text: the answer, and the model's thinking. */
type StreamedKind = 'text' | 'reasoning';

const EMPTY: StreamingSnapshot = { parts: [], msgId: null, generation: null };

/** The streaming message; replaced whole on each change. */
const useStreamingStore = create<StreamingSnapshot>(() => EMPTY);
const current = (): StreamingSnapshot => useStreamingStore.getState();
const publish = (next: StreamingSnapshot): void => useStreamingStore.setState(next, true);

// RAF batching state: deltas of one kind, and the latest generation stats
let pending: { kind: StreamedKind; text: string } | null = null;
let pendingGeneration: GenerationStats | null = null;
let rafId: number | null = null;

/** Get the concatenated text from all text parts */
function getTextFromParts(parts: ChatPart[]): string {
  return parts
    .filter((p): p is Extract<ChatPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('');
}

/** `parts` with `text` added to a trailing part of the same kind, or as a new part. */
function appendText(parts: ChatPart[], kind: StreamedKind, text: string): ChatPart[] {
  const last = parts[parts.length - 1];
  if (last?.type === kind) return [...parts.slice(0, -1), { type: kind, text: last.text + text }];
  return [...parts, { type: kind, text }];
}

/** What a tool event changes on its row; a new row starts as a call with no arguments yet. */
export type ToolCallPatch = Partial<Omit<ToolCallPart, 'type' | 'toolCallId'>> & Pick<ToolCallPart, 'toolName'>;

/** `parts` with the tool row for `toolCallId` patched, or a new row appended. */
function upsertToolPart(parts: ChatPart[], toolCallId: string, patch: ToolCallPatch): ChatPart[] {
  const index = parts.findIndex((p) => p.type === 'tool_call' && p.toolCallId === toolCallId);
  if (index === -1) {
    return [...parts, { type: 'tool_call', toolCallId, arguments: {}, status: 'calling', ...patch }];
  }
  const next = [...parts];
  next[index] = { ...(parts[index] as ToolCallPart), ...patch };
  return next;
}

/** Apply buffered deltas and stats to the snapshot. */
function flushTextBuffer() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (!pending && !pendingGeneration) return;
  const snapshot = current();
  const parts = pending ? appendText(snapshot.parts, pending.kind, pending.text) : snapshot.parts;
  const generation = pendingGeneration ?? snapshot.generation;
  pending = null;
  pendingGeneration = null;
  publish({ ...snapshot, parts, generation });
}

/** Buffer a delta of `kind` for the next frame; a change of kind flushes what's buffered first, keeping order. */
function bufferText(kind: StreamedKind, text: string) {
  if (pending && pending.kind !== kind) flushTextBuffer();
  pending = { kind, text: (pending?.text ?? '') + text };
  if (rafId === null) rafId = requestAnimationFrame(flushTextBuffer);
}

/** Cancel any pending RAF and discard buffered deltas. */
function cancelPendingFlush() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pending = null;
  pendingGeneration = null;
}

export const streamingStore = {
  /** Push an answer chunk; it flushes to the snapshot once per display frame. */
  push(chunk: string) {
    bufferText('text', chunk);
  },

  /** Push a thinking chunk, with the server's latest tokens and speed when it reports them. */
  pushReasoning(chunk: string, generation?: GenerationStats) {
    if (generation) pendingGeneration = generation;
    bufferText('reasoning', chunk);
  },

  /** Merge `patch` into the tool row for `toolCallId`, adding the row where the stream is when it's new. Flushes pending text first. */
  upsertToolCall(toolCallId: string, patch: ToolCallPatch) {
    flushTextBuffer();
    publish({ ...current(), parts: upsertToolPart(current().parts, toolCallId, patch) });
  },

  /** Add a finished part (an image a tool made) where the stream is now. Flushes pending text first. */
  addPart(part: ChatPart) {
    flushTextBuffer();
    publish({ ...current(), parts: [...current().parts, part] });
  },

  /** Start tracking a new streaming message. Cancels any prior pending flush. */
  start(msgId: string) {
    cancelPendingFlush();
    publish({ ...EMPTY, msgId });
  },

  /** Finish streaming — flushes buffer, returns full text and parts, then resets. */
  finish(): { text: string; parts: ChatPart[] } {
    flushTextBuffer();
    const { parts } = current();
    publish(EMPTY);
    return { text: getTextFromParts(parts), parts };
  },

  /** Reset without returning content (abort / error). */
  reset() {
    cancelPendingFlush();
    publish(EMPTY);
  },

  /** The streaming message now (for non-React reads). */
  getSnapshot: current,
};

/** The streaming message; re-renders at most once per display frame. */
export const useStreamingText = (): StreamingSnapshot => useStreamingStore((s) => s);
