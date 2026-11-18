import { describe, expect, it } from 'vitest';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import {
  mergeBullets, reconcileLines, refreshReason, signatureOf, transcriptText, unsentEntries, entryKey,
  type Bullet, type NoteLine,
} from '@features/recording/notes/liveNotes';
import type { LiveEntry } from '@features/recording/live/liveTranscript';

const counter = () => {
  let n = 0;
  return () => `n${++n}`;
};
const at = (atMs: number) => ({ atMs, typedAt: atMs });
const entry = (source: LiveEntry['source'], startMs: number, endMs: number, text = 'x', timed = true): LiveEntry =>
  ({ source, startMs, endMs, text, timed });

describe('reconcileLines', () => {
  it('gives each new line an id and the time it got its first words', () => {
    const id = counter();
    const one = reconcileLines([], 'launch date?', at(1_000), id);
    expect(one).toEqual([{ id: 'n1', text: 'launch date?', atMs: 1_000, typedAt: 1_000 }]);
    const two = reconcileLines(one, 'launch date?\n', at(2_000), id);
    expect(two[1]).toEqual({ id: 'n2', text: '' });
    const typed = reconcileLines(two, 'launch date?\nask Raj', at(3_000), id);
    expect(typed[1]).toEqual({ id: 'n2', text: 'ask Raj', atMs: 3_000, typedAt: 3_000 });
  });

  it('keeps the time a line was first typed while it is edited', () => {
    const id = counter();
    const lines = reconcileLines([], 'ask', at(1_000), id);
    expect(reconcileLines(lines, 'ask Raj', at(9_000), id)[0]).toMatchObject({ id: 'n1', atMs: 1_000 });
  });

  it('gives only an inserted line a new id, keeping the lines around it', () => {
    const id = counter();
    const lines = reconcileLines([], 'a\nc', at(1_000), id);
    const next = reconcileLines(lines, 'a\nb\nc', at(5_000), id);
    expect(next.map((l) => [l.id, l.text, l.atMs])).toEqual([['n1', 'a', 1_000], ['n3', 'b', 5_000], ['n2', 'c', 1_000]]);
  });

  it('drops a deleted line', () => {
    const id = counter();
    const lines = reconcileLines([], 'a\nb\nc', at(1_000), id);
    expect(reconcileLines(lines, 'a\nc', at(2_000), id).map((l) => l.id)).toEqual(['n1', 'n3']);
  });
});

describe('refreshReason', () => {
  const long = [entry('system', 0, NOTES.transcriptStepMs)];
  const short = [entry('system', 0, 1_000)];

  it('refreshes once enough new transcript has arrived, typing or not', () => {
    expect(refreshReason({ unsent: long, notesChanged: false, typingPaused: false })).toBe('transcript');
  });

  it('waits for more transcript without a typing pause', () => {
    expect(refreshReason({ unsent: short, notesChanged: true, typingPaused: false })).toBeNull();
  });

  it('refreshes on a typing pause when the notes or transcript changed', () => {
    expect(refreshReason({ unsent: [], notesChanged: true, typingPaused: true })).toBe('typing');
    expect(refreshReason({ unsent: short, notesChanged: false, typingPaused: true })).toBe('typing');
  });

  it('skips a typing pause when nothing changed', () => {
    expect(refreshReason({ unsent: [], notesChanged: false, typingPaused: true })).toBeNull();
  });
});

describe('transcript bookkeeping', () => {
  it('finds entries not yet sent, whatever order the sources arrive in', () => {
    const mic = entry('microphone', 10_000, 12_000);
    const late = entry('system', 2_000, 4_000);
    expect(unsentEntries([mic, late], new Set([entryKey(mic)]))).toEqual([late]);
  });

  it('writes the transcript in time order, with times only when the model gave them', () => {
    const text = transcriptText(
      [entry('microphone', 65_000, 66_000, 'second', true), entry('system', 5_000, 6_000, 'first', false)],
      (ms) => `t${ms}`,
    );
    expect(text).toBe('Others: first\n(t65000) You: second');
  });

  it('notes signature ignores empty lines', () => {
    expect(signatureOf([{ id: 'a', text: 'x ' }, { id: 'b', text: '  ' }])).toBe('a:x');
  });
});

describe('mergeBullets', () => {
  const lines: NoteLine[] = [{ id: 'n1', text: 'launch?' }, { id: 'n2', text: 'api' }, { id: 'n3', text: 'qa' }];

  it('replaces a known bullet where it stands', () => {
    const current: Bullet[] = [{ id: 'b1', noteId: 'n1', text: 'old' }, { id: 'b2', noteId: 'n2', text: 'api' }];
    expect(mergeBullets(current, [{ id: 'b1', text: 'Launch: 14 Dec' }], lines)).toEqual([
      { id: 'b1', noteId: 'n1', text: 'Launch: 14 Dec' },
      { id: 'b2', noteId: 'n2', text: 'api' },
    ]);
  });

  it('adds a new bullet in note order with the next free id', () => {
    const current: Bullet[] = [{ id: 'b1', noteId: 'n1', text: 'a' }, { id: 'b3', noteId: 'n3', text: 'c' }];
    const merged = mergeBullets(current, [{ noteId: 'n2', text: 'b' }], lines);
    expect(merged.map((b) => [b.id, b.noteId])).toEqual([['b1', 'n1'], ['b4', 'n2'], ['b3', 'n3']]);
  });

  it('appends a bullet that expands no note, and treats an unknown id as new', () => {
    const current: Bullet[] = [{ id: 'b1', noteId: 'n1', text: 'a' }];
    const merged = mergeBullets(current, [{ id: 'b9', text: 'Decision: ship' }], lines);
    expect(merged.at(-1)).toEqual({ id: 'b2', noteId: undefined, text: 'Decision: ship' });
  });

  it('drops bullets of deleted note lines and ignores empty text', () => {
    const current: Bullet[] = [{ id: 'b1', noteId: 'gone', text: 'a' }, { id: 'b2', text: 'free' }];
    expect(mergeBullets(current, [{ id: 'b2', text: '  ' }], lines)).toEqual([{ id: 'b2', text: 'free' }]);
  });
});
