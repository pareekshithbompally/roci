import { describe, it, expect } from 'vitest';
import { groupToolCalls } from '@features/chat/components/tool-call/groupToolCalls';
import type { ChatPart } from '@shared/types';

const call = (id: string): ChatPart => ({ type: 'tool_call', toolCallId: id, toolName: 'search_meetings', arguments: {}, status: 'complete' }) as ChatPart;
const text = (t: string): ChatPart => ({ type: 'text', text: t }) as ChatPart;

describe('groupToolCalls', () => {
  it('gathers calls made back to back and keeps everything else in order', () => {
    const segments = groupToolCalls([call('a'), call('b'), text('then'), call('c')]);
    expect(segments.map((s) => (s.kind === 'tools' ? s.parts.map((p) => p.toolCallId).join('') : 'text'))).toEqual(['ab', 'text', 'c']);
  });
});
