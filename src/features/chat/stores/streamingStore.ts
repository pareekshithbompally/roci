/** The streaming reply's parts as the AI SDK builds them, published once per animation frame so only that message re-renders. */

import { create } from 'zustand';
import type { ChatPart } from '@shared/types';
import type { GenerationStats } from '@services/ai/types';

export interface StreamingSnapshot {
  parts: ChatPart[];
  msgId: string | null;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation: GenerationStats | null;
}

const EMPTY: StreamingSnapshot = { parts: [], msgId: null, generation: null };

/** The streaming message; replaced whole on each change. */
const useStreamingStore = create<StreamingSnapshot>(() => EMPTY);
const current = (): StreamingSnapshot => useStreamingStore.getState();
const publish = (next: StreamingSnapshot): void => useStreamingStore.setState(next, true);

/** What arrived since the last frame. */
let pending: Partial<Pick<StreamingSnapshot, 'parts' | 'generation'>> = {};
let rafId: number | null = null;

function flush(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (Object.keys(pending).length === 0) return;
  publish({ ...current(), ...pending });
  pending = {};
}

function schedule(next: typeof pending): void {
  pending = { ...pending, ...next };
  if (rafId === null) rafId = requestAnimationFrame(flush);
}

function discardPending(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  pending = {};
}

export const streamingStore = {
  /** Start a new streaming message. */
  start(msgId: string) {
    discardPending();
    publish({ ...EMPTY, msgId });
  },

  /** The reply's parts now; shown on the next frame. */
  update(parts: ChatPart[]) {
    schedule({ parts });
  },

  /** A local server's latest tokens and speed; shown on the next frame. */
  setGeneration(generation: GenerationStats) {
    schedule({ generation });
  },

  /** End the stream: returns the parts it reached, then clears. */
  finish(): ChatPart[] {
    flush();
    const { parts } = current();
    publish(EMPTY);
    return parts;
  },

  /** Clear without keeping anything (a failed reply). */
  reset() {
    discardPending();
    publish(EMPTY);
  },

  /** The streaming message now (for non-React reads). */
  getSnapshot: current,
};

/** The streaming message while it is `msgId` (re-renders at most once per display frame), else null: other messages
 *  don't re-render as it streams. */
export const useStreamingMessage = (msgId: string | null): StreamingSnapshot | null =>
  useStreamingStore((s) => (msgId !== null && s.msgId === msgId ? s : null));
