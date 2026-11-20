import { describe, it, expect } from 'vitest';
import { groupActivity } from '@features/chat/components/message/groupActivity';
import type { ChatPart } from '@shared/types';

const call = (id: string): ChatPart => ({ type: 'tool_call', toolCallId: id, toolName: 'search_meetings', arguments: {}, status: 'complete' });
const thought = (t: string): ChatPart => ({ type: 'reasoning', text: t });
const text = (t: string): ChatPart => ({ type: 'text', text: t });

/** Each segment as a short string: a run lists its parts. */
const shape = (parts: ChatPart[]) =>
  groupActivity(parts).map((segment) =>
    segment.kind === 'activity' ? segment.items.map(({ part }) => (part.type === 'reasoning' ? 'R' : 'T')).join('') : 'text',
  );

describe('groupActivity', () => {
  it('keeps every step of a multi-step reply (thinking, tool, thinking, tool) in one run', () => {
    expect(shape([thought('a'), call('1'), thought('b'), call('2'), thought('c')])).toEqual(['RTRTR']);
  });

  it('ends a run at answer text and starts a new one after', () => {
    expect(shape([thought('a'), call('1'), text('so'), call('2')])).toEqual(['RT', 'text', 'T']);
  });

  it('remembers where each part sits in the message', () => {
    const [run] = groupActivity([text('hi'), call('1')]).slice(1);
    expect(run.kind === 'activity' && run.items[0].index).toBe(1);
  });
});
