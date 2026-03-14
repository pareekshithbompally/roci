/**
 * Streaming Store
 *
 * Lightweight external store for streaming message content.
 * Uses useSyncExternalStore pattern so only the streaming ChatMessage
 * re-renders during streaming — the rest of the UI stays untouched.
 *
 * This isolates streaming updates from the rest of the component tree,
 * so only the streaming message re-renders during generation.
 *
 * Supports multimodal content: text deltas are appended to the current
 * text part, while media parts (image/audio/video) are pushed as
 * separate entries in the parts array.
 */

import { useSyncExternalStore } from 'react';
import type { ChatPart } from '@/types';

export interface StreamingSnapshot {
  parts: ChatPart[];
  msgId: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: StreamingSnapshot = { parts: [], msgId: null };

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

export const streamingStore = {
  /** Push a text chunk. Appends to the last text part or creates one. */
  push(chunk: string) {
    const parts = [...snapshot.parts];
    const lastPart = parts[parts.length - 1];

    if (lastPart && lastPart.type === 'text') {
      parts[parts.length - 1] = { type: 'text', text: lastPart.text + chunk };
    } else {
      parts.push({ type: 'text', text: chunk });
    }

    snapshot = { ...snapshot, parts };
    emitChange();
  },

  /** Push a media part (image, audio, video). */
  pushPart(part: ChatPart) {
    snapshot = { ...snapshot, parts: [...snapshot.parts, part] };
    emitChange();
  },

  /** Start tracking a new streaming message. */
  start(msgId: string) {
    snapshot = { parts: [], msgId };
    emitChange();
  },

  /** Finish streaming — returns the full accumulated text and parts, then resets. */
  finish(): { text: string; parts: ChatPart[] } {
    const text = getTextFromParts(snapshot.parts);
    const parts = snapshot.parts;
    snapshot = { parts: [], msgId: null };
    emitChange();
    return { text, parts };
  },

  /** Reset without returning content (abort / error). */
  reset() {
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
 * Only triggers re-renders when the snapshot changes.
 */
export function useStreamingText(): StreamingSnapshot {
  return useSyncExternalStore(
    streamingStore.subscribe,
    streamingStore.getSnapshot,
    streamingStore.getSnapshot,
  );
}
