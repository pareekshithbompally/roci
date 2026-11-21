import { describe, it, expect, beforeEach } from 'vitest';
import { streamingStore } from '@features/chat/stores/streamingStore';
import type { ChatPart } from '@shared/types';

const text = (t: string): ChatPart => ({ type: 'text', text: t, state: 'streaming' });

describe('streamingStore', () => {
  beforeEach(() => streamingStore.start('msg'));

  it('ends with the latest parts the SDK built, even before a frame showed them', () => {
    streamingStore.update([text('Let')]);
    streamingStore.update([text('Let me check.')]);
    expect(streamingStore.finish()).toEqual([text('Let me check.')]);
    expect(streamingStore.getSnapshot()).toMatchObject({ msgId: null, parts: [] });
  });

  it('starts each reply empty, on its own message', () => {
    streamingStore.update([text('old')]);
    streamingStore.start('next');
    expect(streamingStore.getSnapshot()).toEqual({ msgId: 'next', parts: [], generation: null });
    expect(streamingStore.finish()).toEqual([]);
  });

  it('keeps nothing on reset (a failed reply)', () => {
    streamingStore.update([text('half')]);
    streamingStore.reset();
    expect(streamingStore.finish()).toEqual([]);
  });

  it('shows the parts and a local server’s tokens and speed together, once per frame', async () => {
    const generation = { tokens: 12, elapsedMs: 400, tokensPerSecond: 30 };
    streamingStore.setGeneration(generation);
    streamingStore.update([text('Hi')]);
    expect(streamingStore.getSnapshot().parts).toEqual([]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(streamingStore.getSnapshot()).toEqual({ msgId: 'msg', parts: [text('Hi')], generation });
  });
});
