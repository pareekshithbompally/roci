/** Streaming message store; text and thinking deltas batch per animation frame so only the streaming message re-renders. */

import { useSyncExternalStore } from 'react';
import type { ChatPart } from '@shared/types';
import type { GenerationStats } from '@services/ai/types';

export interface StreamingSnapshot {
  parts: ChatPart[];
  msgId: string | null;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation: GenerationStats | null;
}

/** The streamed kinds of text: the answer, and the model's thinking. */
type StreamedKind = 'text' | 'reasoning';

type Listener = () => void;

const listeners = new Set<Listener>();
const EMPTY: StreamingSnapshot = { parts: [], msgId: null, generation: null };
let snapshot: StreamingSnapshot = EMPTY;

// RAF batching state: deltas of one kind, and the latest generation stats
let pending: { kind: StreamedKind; text: string } | null = null;
let pendingGeneration: GenerationStats | null = null;
let rafId: number | null = null;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

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

/** Apply buffered deltas and stats to the snapshot and notify listeners. */
function flushTextBuffer() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (!pending && !pendingGeneration) return;
  const parts = pending ? appendText(snapshot.parts, pending.kind, pending.text) : snapshot.parts;
  snapshot = { ...snapshot, parts, generation: pendingGeneration ?? snapshot.generation };
  pending = null;
  pendingGeneration = null;
  emitChange();
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

  /** Push a media part (image, audio, video, tool_call). Flushes pending text first. */
  pushPart(part: ChatPart) {
    flushTextBuffer();
    snapshot = { ...snapshot, parts: [...snapshot.parts, part] };
    emitChange();
  },

  /** Update an existing tool_call part by its toolCallId. Flushes pending text first. */
  updatePartByKey(toolCallId: string, updater: (part: ChatPart) => ChatPart) {
    flushTextBuffer();
    const parts = snapshot.parts.map(p =>
      p.type === 'tool_call' && p.toolCallId === toolCallId ? updater(p) : p
    );
    snapshot = { ...snapshot, parts };
    emitChange();
  },

  /** Start tracking a new streaming message. Cancels any prior pending flush. */
  start(msgId: string) {
    cancelPendingFlush();
    snapshot = { ...EMPTY, msgId };
    emitChange();
  },

  /** Finish streaming — flushes buffer, returns full text and parts, then resets. */
  finish(): { text: string; parts: ChatPart[] } {
    flushTextBuffer();
    const text = getTextFromParts(snapshot.parts);
    const parts = snapshot.parts;
    snapshot = EMPTY;
    emitChange();
    return { text, parts };
  },

  /** Reset without returning content (abort / error). */
  reset() {
    cancelPendingFlush();
    snapshot = EMPTY;
    emitChange();
  },

  /** Get current snapshot (for non-React reads). */
  getSnapshot(): StreamingSnapshot {
    return snapshot;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Subscribe to streaming content; re-renders at most once per display frame. */
export function useStreamingText(): StreamingSnapshot {
  return useSyncExternalStore(
    streamingStore.subscribe,
    streamingStore.getSnapshot,
    streamingStore.getSnapshot,
  );
}
