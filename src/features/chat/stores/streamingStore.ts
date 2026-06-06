/**
 * Streaming Store
 *
 * Lightweight external store for streaming message content.
 * Uses useSyncExternalStore pattern so only the streaming ChatMessage
 * re-renders during streaming — the rest of the UI stays untouched.
 *
 * Text deltas are batched via requestAnimationFrame — chunks accumulate
 * in a buffer and flush once per display frame (~16ms at 60Hz, ~8ms at
 * 120Hz). This caps re-renders at the display refresh rate regardless
 * of how frequently the provider sends deltas.
 *
 * Non-text operations (pushPart, updatePartByKey, finish, reset) flush
 * the text buffer synchronously first to preserve part ordering and
 * ensure callers always see the latest accumulated state.
 *
 * Supports multimodal content: text deltas are appended to the current
 * text part, while media parts (image/audio/video) are pushed as
 * separate entries in the parts array.
 */

import { useSyncExternalStore } from 'react';
import type { ChatPart } from '@shared/types';

export interface StreamingSnapshot {
  parts: ChatPart[];
  msgId: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: StreamingSnapshot = { parts: [], msgId: null };

// RAF batching state for text deltas
let pendingText = '';
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

/** Apply accumulated text buffer to the snapshot and notify listeners. */
function flushTextBuffer() {
  rafId = null;
  if (!pendingText) return;

  const chunk = pendingText;
  pendingText = '';

  const parts = [...snapshot.parts];
  const lastPart = parts[parts.length - 1];

  if (lastPart && lastPart.type === 'text') {
    parts[parts.length - 1] = { type: 'text', text: lastPart.text + chunk };
  } else {
    parts.push({ type: 'text', text: chunk });
  }

  snapshot = { ...snapshot, parts };
  emitChange();
}

/** Cancel any pending RAF and discard buffered text. */
function cancelPendingFlush() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingText = '';
}

export const streamingStore = {
  /**
   * Push a text chunk. Batched via requestAnimationFrame —
   * accumulated text flushes to the snapshot once per display frame.
   */
  push(chunk: string) {
    pendingText += chunk;
    if (rafId === null) {
      rafId = requestAnimationFrame(flushTextBuffer);
    }
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
    snapshot = { parts: [], msgId };
    emitChange();
  },

  /** Finish streaming — flushes buffer, returns full text and parts, then resets. */
  finish(): { text: string; parts: ChatPart[] } {
    flushTextBuffer();
    const text = getTextFromParts(snapshot.parts);
    const parts = snapshot.parts;
    snapshot = { parts: [], msgId: null };
    emitChange();
    return { text, parts };
  },

  /** Reset without returning content (abort / error). */
  reset() {
    cancelPendingFlush();
    snapshot = { parts: [], msgId: null };
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

/**
 * Hook to subscribe to streaming content updates.
 * Only triggers re-renders when the snapshot changes (at most once per display frame).
 */
export function useStreamingText(): StreamingSnapshot {
  return useSyncExternalStore(
    streamingStore.subscribe,
    streamingStore.getSnapshot,
    streamingStore.getSnapshot,
  );
}
