import { describe, it, expect } from 'vitest';
import { groupActivity, liveIndexOf } from '@features/chat/components/message/groupActivity';
import type { ChatPart } from '@shared/types';

const call = (id: string, meta?: object): ChatPart => ({
  type: 'tool-search_meetings', toolCallId: id, state: 'output-available', input: {},
  output: { toolCallId: id, content: 'ok', isError: false, meta },
});
const thought = (t: string): ChatPart => ({ type: 'reasoning', text: t });
const text = (t: string): ChatPart => ({ type: 'text', text: t });
const step: ChatPart = { type: 'step-start' };

/** Each segment as a short string: a run lists its parts. */
const shape = (parts: ChatPart[]) =>
  groupActivity(parts).map((segment) =>
    segment.kind === 'activity' ? segment.items.map(({ part }) => (part.type === 'reasoning' ? 'R' : 'T')).join('') : segment.kind,
  );

describe('groupActivity', () => {
  it('keeps every step of a multi-step reply (thinking, tool, thinking, tool) in one run', () => {
    expect(shape([step, thought('a'), call('1'), step, thought('b'), call('2'), thought('c')])).toEqual(['RTRTR']);
  });

  it('ends a run at answer text and starts a new one after', () => {
    expect(shape([thought('a'), call('1'), text('so'), call('2')])).toEqual(['RT', 'text', 'T']);
  });

  it('shows thinking blocks streamed back to back as one row', () => {
    const [run] = groupActivity([thought('First.'), thought('Then.'), call('1')]);
    expect(run.kind === 'activity' && run.items.map(({ part, index }) => [part.type === 'reasoning' && part.text, index]))
      .toEqual([['First.\n\nThen.', 1], [false, 2]]);
  });

  it("puts a tool's image right after its row, before the text that follows", () => {
    const image = { mediaType: 'image/png', path: 'images/a.png', alt: 'a fox' };
    const segments = groupActivity([text('Drawing it.'), call('1', { image }), text('Here it is.')]);
    expect(segments.map((s) => s.kind)).toEqual(['text', 'activity', 'media', 'text']);
    expect(segments[2].kind === 'media' && segments[2].item.part).toEqual(image);
  });

  it('shows nothing for parts only the model reads, nor for sources and step starts', () => {
    expect(shape([
      { type: 'data-sentAt', data: { at: 1 } }, step, { type: 'source-url', sourceId: 's', url: 'https://a.com' }, text('hi'),
    ])).toEqual(['text']);
  });

  it('remembers where each part sits in the message, and which is the newest shown', () => {
    const segments = groupActivity([text('hi'), call('1'), step]);
    expect(segments[1].kind === 'activity' && segments[1].items[0].index).toBe(1);
    expect(liveIndexOf(segments)).toBe(1);
    expect(liveIndexOf([])).toBeNull();
  });
});
