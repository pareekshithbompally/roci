import { describe, it, expect, beforeEach } from 'vitest';
import { streamingStore } from '@features/chat/stores/streamingStore';

describe('streamingStore.upsertToolCall', () => {
  beforeEach(() => streamingStore.start('msg'));

  it('adds a calling row after the text streamed so far', () => {
    streamingStore.push('Let me check.');
    streamingStore.upsertToolCall('c1', { toolName: 'webSearch', status: 'calling' });
    expect(streamingStore.getSnapshot().parts).toEqual([
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_call', toolCallId: 'c1', toolName: 'webSearch', arguments: {}, status: 'calling' },
    ]);
  });

  it('fills the same row in place as the tool progresses', () => {
    streamingStore.upsertToolCall('c1', { toolName: 'webSearch', status: 'calling' });
    streamingStore.upsertToolCall('c1', { toolName: 'webSearch', arguments: { query: 'ai' } });
    streamingStore.upsertToolCall('c1', { toolName: 'webSearch', status: 'complete', result: { content: 'x', isError: false } });
    expect(streamingStore.getSnapshot().parts).toEqual([
      { type: 'tool_call', toolCallId: 'c1', toolName: 'webSearch', arguments: { query: 'ai' }, status: 'complete', result: { content: 'x', isError: false } },
    ]);
  });

  it('creates the row when the first event is not a start', () => {
    streamingStore.upsertToolCall('c2', { toolName: 'get_meeting', arguments: { meeting_id: 'm1' } });
    expect(streamingStore.getSnapshot().parts).toEqual([
      { type: 'tool_call', toolCallId: 'c2', toolName: 'get_meeting', arguments: { meeting_id: 'm1' }, status: 'calling' },
    ]);
  });
});

describe('streamingStore.addPart', () => {
  beforeEach(() => streamingStore.start('msg'));

  it("puts a tool's image right after its row, before the text that follows, and keeps it on finish", () => {
    const image = { type: 'image' as const, mimeType: 'image/png', source: { kind: 'file' as const, path: 'images/a.png' }, alt: 'a fox' };
    streamingStore.push('Drawing it.');
    streamingStore.upsertToolCall('c1', { toolName: 'generate_image', status: 'complete' });
    streamingStore.addPart(image);
    streamingStore.push('Here it is.');
    const { parts } = streamingStore.finish();
    expect(parts.map((p) => p.type)).toEqual(['text', 'tool_call', 'image', 'text']);
    expect(parts[2]).toEqual(image);
  });
});
