/** The palette's scorer (ported from frappe/helpdesk's command palette): prefix > word start > mid-word > scattered letters. */

import { describe, it, expect } from 'vitest';
import { fuzzyScore, scoreCommand } from '@features/palette/fuzzyScore';
import type { PaletteCommand } from '@features/palette/paletteTypes';

const NO_MATCH = -1;
const command = (fields: Partial<PaletteCommand>): PaletteCommand => ({ id: 'x', title: 'X', group: 'G', ...fields });

describe('fuzzyScore', () => {
  it('a prefix outranks a later word', () => {
    expect(fuzzyScore('Change status', 'change')).toBeGreaterThan(fuzzyScore('Change status', 'status'));
  });

  it('a substring outranks scattered letters', () => {
    expect(fuzzyScore('Change status', 'status')).toBeGreaterThan(fuzzyScore('Assign to', 'sgn'));
  });

  it('no match, and an empty query is neutral', () => {
    expect(fuzzyScore('Change status', 'zzz')).toBe(NO_MATCH);
    expect(fuzzyScore('Change status', '')).toBe(0);
  });

  it('a missing letter fails even with the rest in order', () => {
    expect(fuzzyScore('Reply to ticket', 'replyx')).toBe(NO_MATCH);
  });

  it('finds acronym-like input', () => {
    expect(fuzzyScore('New Chat', 'nc')).toBeGreaterThan(NO_MATCH);
  });

  it('a word-start hit beats the same offset mid-word', () => {
    expect(fuzzyScore('Change status', 'status')).toBeGreaterThan(fuzzyScore('Changestatus', 'status'));
  });

  it('an undefined title never matches', () => {
    expect(fuzzyScore(undefined as unknown as string, 'a')).toBe(NO_MATCH);
  });
});

describe('scoreCommand', () => {
  it('a title match beats the same match in keywords', () => {
    expect(scoreCommand(command({ title: 'Theme' }), 'theme')).toBeGreaterThan(scoreCommand(command({ title: 'Toggle', keywords: 'theme' }), 'theme'));
  });

  it('weight sinks a row (Go to links once something is typed)', () => {
    expect(scoreCommand(command({ title: 'To-dos', weight: 0.7 }), 'to')).toBeLessThan(scoreCommand(command({ title: 'Toggle theme' }), 'to'));
  });

  it('a fixed rank (search index hits) bypasses scoring', () => {
    expect(scoreCommand(command({ title: 'Nothing alike', rank: 950 }), 'zzz')).toBe(950);
  });

  it('no match is filtered out', () => {
    expect(scoreCommand(command({ title: 'Settings' }), 'zzz')).toBe(NO_MATCH);
  });

  it('a row hidden until typed surfaces only on a real substring, never on scattered letters', () => {
    const providers = command({ title: 'Providers', keywords: 'api key', hideWhenEmpty: true });
    expect(scoreCommand(providers, 'api')).toBeGreaterThan(0);
    expect(scoreCommand(providers, 'pvs')).toBe(NO_MATCH);
  });
});
