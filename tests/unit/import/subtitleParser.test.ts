import { describe, it, expect } from 'vitest';
import { parseSubtitleFile } from '@features/import/parsers/subtitle-parser';

describe('parseSubtitleFile', () => {
  it('keeps every cue after a STYLE block (the block ends at its blank line)', () => {
    const vtt = 'WEBVTT\n\nSTYLE\n::cue { color: lime }\n\n00:00:01.000 --> 00:00:02.000\nHello there\n\n00:00:03.000 --> 00:00:04.000\nWe ship Friday';
    expect(parseSubtitleFile(vtt, 'vtt')).toBe('Hello there\nWe ship Friday');
  });

  it('skips NOTE blocks, but keeps dialogue that merely starts with "Note" or "Style"', () => {
    const vtt = 'WEBVTT\n\nNOTE written by the tool\n\n00:00:01.000 --> 00:00:02.000\nNote that we ship Friday\n\n00:00:03.000 --> 00:00:04.000\nStyle matters here';
    expect(parseSubtitleFile(vtt, 'vtt')).toBe('Note that we ship Friday\nStyle matters here');
  });

  it('reads SRT: cue numbers, timecodes and tags removed', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i>\n\n2\n00:00:03,000 --> 00:00:04,000\nBye';
    expect(parseSubtitleFile(srt, 'srt')).toBe('Hello\nBye');
  });
});
