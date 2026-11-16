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
