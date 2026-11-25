import { describe, expect, it } from 'vitest';
import {
  aiRows, enhancedBullets, reconcileLines, summaryBullets,
  type Bullet, type NoteLine,
} from '@features/recording/notes/liveNotes';

const counter = () => {
  let n = 0;
  return () => `n${++n}`;
};
const at = (atMs: number) => ({ atMs, typedAt: atMs });

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

describe('aiRows', () => {
  it('reads in time order: each line at its time, each note where it was typed (itself while it waits)', () => {
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

describe('enhancedBullets', () => {
  it("fills each written note with the summary's line in order, skipping blank lines and missing items", () => {
    const lines = [{ id: 'n1', text: 'pricing', atMs: 1_000 }, { id: 'n2', text: '  ' }, { id: 'n3', text: 'launch' }];
    expect(enhancedBullets(lines, ['Pricing: three tiers'])).toEqual([{ id: 'b1', noteId: 'n1', text: 'Pricing: three tiers', atMs: 1_000 }]);
    expect(enhancedBullets(lines, ['A', 'B']).map((b) => [b.noteId, b.text])).toEqual([['n1', 'A'], ['n3', 'B']]);
  });
});

describe('the written summary in the AI Summary pane', () => {
  it('shows each typed note filled in at its time, then the key points after them', () => {
    const lines = [
      { id: 'n1', text: 'budget?', atMs: 60_000 },
      { id: 'n2', text: 'hiring', atMs: 120_000 },
    ];
    const bullets = summaryBullets(lines, ['Budget: 1.2M approved.', 'Hiring paused until January.'], ['Q3 plan agreed.']);
    expect(aiRows(lines, bullets).map((r) => (r.kind === 'bullet' ? r.bullet.text : `waiting:${r.line.id}`))).toEqual([
      'Budget: 1.2M approved.',
      'Hiring paused until January.',
      'Q3 plan agreed.',
    ]);
  });

  it('keeps the key points when no notes were typed', () => {
    expect(summaryBullets([], [], ['Q3 plan agreed.', 'Launch moved to May.']).map((b) => b.text)).toEqual(['Q3 plan agreed.', 'Launch moved to May.']);
  });
});
