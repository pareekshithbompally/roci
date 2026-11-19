import { describe, expect, it } from 'vitest';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import {
  enhancedBullets,
  aiRows, changedNotes, changesFromReply, liveNotesRequest, mergeBullets, notesSeen, NO_RECALL, recallOf, reconcileLines, refreshReason, signatureOf,
  transcriptText, unsentEntries, entryKey,
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
  const step = NOTES.transcriptStepMs;
  const reason = (unsent: LiveEntry[], coveredUntilMs: number, notesChanged: boolean, typingPaused: boolean) =>
    refreshReason({ unsent, coveredUntilMs, notesChanged, typingPaused });

  it('updates every step of meeting time, pauses included, typing or not', () => {
    // two short lines with a long pause between: little speech, but the meeting has moved on a step
    expect(reason([entry('system', 1_000, 3_000), entry('system', step - 2_000, step)], 0, false, false)).toBe('transcript');
    expect(reason([entry('system', step + 1_000, 2 * step)], step, false, false)).toBe('transcript');
  });

  it('waits until the meeting has moved on a step past what the last update covered', () => {
    expect(reason([entry('system', step, step + 5_000)], step, true, false)).toBeNull();
  });

  it('updates on a typing pause when the notes or transcript changed', () => {
    expect(reason([], 0, true, true)).toBe('typing');
    expect(reason([entry('system', 0, 1_000)], 0, false, true)).toBe('typing');
  });

  it('skips a typing pause when nothing changed', () => {
    expect(reason([], 0, false, true)).toBeNull();
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
    expect(text).toBe('Others: first\n[t65000] You: second');
  });

  it('notes signature ignores empty lines', () => {
    expect(signatureOf([{ id: 'a', text: 'x ' }, { id: 'b', text: '  ' }])).toBe('a:x');
  });
});

describe('mergeBullets', () => {
  const lines: NoteLine[] = [{ id: 'n1', text: 'launch?', atMs: 40_000 }, { id: 'n2', text: 'api', atMs: 70_000 }];

  it('writes the meeting\'s points with no notes typed at all', () => {
    const merged = mergeBullets([], [{ text: 'Q3 budget: 1.2M approved.' }, { text: 'Hiring paused until Jan.' }], [], 5_000);
    expect(merged).toEqual([
      { id: 'b1', noteId: undefined, text: 'Q3 budget: 1.2M approved.', atMs: 5_000 },
      { id: 'b2', noteId: undefined, text: 'Hiring paused until Jan.', atMs: 5_000 },
    ]);
  });

  it('updates a point by id and a note\'s line by note, where they stand', () => {
    const current: Bullet[] = [{ id: 'b1', text: 'Budget', atMs: 0 }, { id: 'b2', noteId: 'n1', text: 'old', atMs: 40_000 }];
    expect(mergeBullets(current, [{ id: 'b1', text: 'Budget: 1.2M' }, { noteId: 'n1', text: 'Launch: 14 Dec' }], lines, 90_000)).toEqual([
      { id: 'b1', text: 'Budget: 1.2M', atMs: 0 },
      { id: 'b2', noteId: 'n1', text: 'Launch: 14 Dec', atMs: 40_000 },
    ]);
  });

  it('places a note\'s first line at the time the note was typed, a new point at its talk', () => {
    const merged = mergeBullets([], [{ noteId: 'n2', text: 'API: rate limits' }, { id: 'b9', text: 'QA window tight' }], lines, 60_000);
    expect(merged.map((b) => [b.id, b.noteId, b.atMs])).toEqual([['b1', 'n2', 70_000], ['b2', undefined, 60_000]]);
  });

  it('drops lines of deleted notes and ignores empty text', () => {
    const current: Bullet[] = [{ id: 'b1', noteId: 'gone', text: 'a' }, { id: 'b2', text: 'free' }];
    expect(mergeBullets(current, [{ id: 'b2', text: '  ' }], lines, 0)).toEqual([{ id: 'b2', text: 'free' }]);
  });
});

describe('liveNotesRequest and changesFromReply', () => {
  const lines: NoteLine[] = [
    { id: 'uuid-a', text: ' launch? ', atMs: 40_000 },
    { id: 'uuid-b', text: '' },
    { id: 'uuid-c', text: 'ask Raj' },
  ];
  const bullets: Bullet[] = [{ id: 'b1', noteId: 'uuid-a', text: 'Launch: 14 Dec' }, { id: 'b2', text: 'Decision: ship' }];

  it('sends the notes under short ids the model can copy, with how they stand', () => {
    const { input } = liveNotesRequest(lines, bullets, 'You: hi', { recall: NO_RECALL, participants: [] }, (ms) => `t${ms}`);
    expect(input.notes).toEqual([{ id: 'n1', text: 'launch?', at: 't40000' }, { id: 'n2', text: 'ask Raj', at: undefined }]);
    expect(input.filled).toEqual([{ noteId: 'n1', text: 'Launch: 14 Dec' }]);
    expect(input.points).toEqual([{ id: 'b2', text: 'Decision: ship' }]);
  });

  it('maps the reply back to real note ids and drops a note it does not know', () => {
    const { realId } = liveNotesRequest(lines, bullets, '', { recall: NO_RECALL, participants: [] }, String);
    expect(changesFromReply({ filled: [{ noteId: 'n2', text: 'Ask Raj about rate limits.' }, { noteId: 'n9', text: 'x' }], points: [{ text: 'Task: QA' }] }, realId))
      .toEqual([{ noteId: 'uuid-c', text: 'Ask Raj about rate limits.' }, { id: undefined, text: 'Task: QA' }]);
  });
});

describe('recall', () => {
  const spans = new Map([
    ['[02:10] Others: the budget is ten thousand', { startMs: 120_000, endMs: 140_000 }],
    ['[05:00] You: we hire two engineers', { startMs: 290_000, endMs: 310_000 }],
  ]);

  it('only new or edited notes ask for earlier talk', () => {
    const lines: NoteLine[] = [{ id: 'a', text: 'budget?' }, { id: 'b', text: 'hiring' }];
    expect(changedNotes(lines, notesSeen([{ id: 'a', text: 'budget?' }, { id: 'b', text: 'hire' }]))).toEqual(['hiring']);
  });

  it('keeps the notes\' passages once each, only this recording\'s, and the time of every hit', () => {
    const recall = recallOf(
      [['[02:10] Others: the budget is ten thousand', 'unknown text'], ['[02:10] Others: the budget is ten thousand']],
      ['[02:10] Others: the budget is ten thousand', '[05:00] You: we hire two engineers'],
      spans,
    );
    expect(recall.passages).toEqual(['[02:10] Others: the budget is ten thousand']);
    expect(recall.spans).toEqual([{ startMs: 120_000, endMs: 140_000 }, { startMs: 290_000, endMs: 310_000 }]);
  });

  it('sends the newest points and older ones whose talk was recalled, with the earlier talk', () => {
    const points: Bullet[] = Array.from({ length: NOTES.recall.recentPoints + 2 }, (_, i) => ({ id: `b${i + 1}`, text: `p${i + 1}`, atMs: i * 100_000 }));
    const { input } = liveNotesRequest([], points, 'You: back to the budget', { recall: { passages: ['earlier talk'], spans: [{ startMs: 90_000, endMs: 110_000 }] }, participants: ['Priya'] }, String);
    expect(input.points.map((p) => p.id)).toEqual(['b2', ...points.slice(-NOTES.recall.recentPoints).map((p) => p.id)]);
    expect(input.earlier).toEqual(['earlier talk']);
    expect(input.participants).toEqual(['Priya']);
  });
});

describe('aiRows', () => {
  it('reads in time order: points as their talk arrived, each note where it was typed (itself while it waits)', () => {
    const lines: NoteLine[] = [{ id: 'n1', text: 'launch?', atMs: 30_000 }, { id: 'n2', text: '' }, { id: 'n3', text: 'api', atMs: 80_000 }];
    const bullets: Bullet[] = [
      { id: 'b3', text: 'QA window is tight.', atMs: 60_000 },
      { id: 'b1', text: 'Budget approved.', atMs: 0 },
      { id: 'b2', noteId: 'n1', text: 'Launch: 14 Dec', atMs: 30_000 },
    ];
    expect(aiRows(lines, bullets).map((r) => (r.kind === 'bullet' ? r.bullet.id : `waiting:${r.line.id}`)))
      .toEqual(['b1', 'b2', 'b3', 'waiting:n3']);
  });
});

describe('liveNotesSchema', () => {
  it('asks for the meeting\'s points even with no notes, and fills only the notes it lists', async () => {
    const { liveNotesSchema } = await import('@core/ai/schemas/liveNotes.schema');
    const { jsonSchemaOf } = await import('@core/ai/schemas/reply');
    type Json = { required: string[]; properties: Record<string, { items: { properties: Record<string, { enum?: string[] }> } }> };
    const given = (ids: string[]) => jsonSchemaOf(liveNotesSchema(ids)) as unknown as Json;
    expect(given([]).required).toEqual(['points']);
    expect(given([]).properties).not.toHaveProperty('filled');
    const withNotes = given(['n1', 'n2']);
    expect(withNotes.required).toEqual(['points', 'filled']);
    expect(withNotes.properties.filled.items.properties.noteId.enum).toEqual(['n1', 'n2']);
  });
});

describe('enhancedBullets', () => {
  it("fills each written note with the summary's line in order, skipping blank lines and missing items", () => {
    const lines = [{ id: 'n1', text: 'pricing', atMs: 1_000 }, { id: 'n2', text: '  ' }, { id: 'n3', text: 'launch' }];
    expect(enhancedBullets(lines, ['Pricing: three tiers'])).toEqual([{ id: 'b1', noteId: 'n1', text: 'Pricing: three tiers', atMs: 1_000 }]);
    expect(enhancedBullets(lines, ['A', 'B']).map((b) => [b.noteId, b.text])).toEqual([['n1', 'A'], ['n3', 'B']]);
  });
});
