/** What the palette lists for (query, drill level): recents and commands before typing; results then commands while typing. */

import { describe, it, expect } from 'vitest';
import { buildGroups, resultGroups } from '@features/palette/buildGroups';
import type { PaletteCommand } from '@features/palette/paletteTypes';

const cmd = (id: string, group: string, title = id, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({ id, title, group, ...extra });
const titles = (groups: { title: string; items: PaletteCommand[] }[]) => groups.map((g) => [g.title, g.items.map((c) => c.title)]);

const ROOT = [
  cmd('r1', 'Recent', 'Weekly Sync'),
  cmd('new', 'Actions', 'New Chat'),
  cmd('todos', 'Go to', 'To-dos', { weight: 0.7 }),
  cmd('theme', 'Settings', 'Toggle theme', { keywords: 'dark light appearance' }),
];

describe('buildGroups', () => {
  it('before typing: every root group in order, recents first', () => {
    expect(titles(buildGroups({ term: '', level: null, root: ROOT, results: [] }))).toEqual([
      ['Recent', ['Weekly Sync']], ['Actions', ['New Chat']], ['Go to', ['To-dos']], ['Settings', ['Toggle theme']],
    ]);
  });

  it('while typing: results first, then the matching commands; recents give way to results', () => {
    const results = [{ title: 'Meetings', items: [cmd('m1', 'Meetings', 'Pricing sync')] }];
    expect(titles(buildGroups({ term: 'dark', level: null, root: ROOT, results }))).toEqual([
      ['Meetings', ['Pricing sync']], ['Settings', ['Toggle theme']],
    ]);
  });

  it('rows hidden until typed stay out of the list before typing', () => {
    const root = [...ROOT, cmd('providers', 'Settings', 'Providers', { hideWhenEmpty: true })];
    expect(titles(buildGroups({ term: '', level: null, root, results: [] })).at(-1)).toEqual(['Settings', ['Toggle theme']]);
  });

  it('inside a drill level: only its rows, without repeating the breadcrumb as a header', () => {
    const level = { title: 'Settings', commands: [cmd('general', 'Settings', 'General'), cmd('providers', 'Settings', 'Providers')] };
    expect(titles(buildGroups({ term: 'prov', level, root: ROOT, results: [] }))).toEqual([['', ['Providers']]]);
  });
});

describe('resultGroups', () => {
  const meeting = (i: number) => cmd(`m${i}`, 'Meetings', `Meeting ${i}`);

  it('shows five of a kind, then Show all N that drills into every one', () => {
    const [group] = resultGroups([{ title: 'Meetings', items: Array.from({ length: 7 }, (_, i) => meeting(i)) }]);
    expect(group.items.map((c) => c.title)).toEqual(['Meeting 0', 'Meeting 1', 'Meeting 2', 'Meeting 3', 'Meeting 4', 'Show all 7']);
    expect(group.items[5].children?.().length).toBe(7);
  });

  it('five or fewer: no Show all row', () => {
    const [group] = resultGroups([{ title: 'Meetings', items: [meeting(0), meeting(1)] }]);
    expect(group.items.map((c) => c.title)).toEqual(['Meeting 0', 'Meeting 1']);
  });

  it('a kind with no matches is left out', () => {
    expect(resultGroups([{ title: 'Chats', items: [] }])).toEqual([]);
  });
});
