/** What the palette lists (after frappe/helpdesk's `buildGroups`): one pure function of the query and the drill level. */

import { PALETTE_CONFIG } from '@config/palette.config';
import { scoreCommand } from './fuzzyScore';
import type { PaletteCommand, PaletteGroup, PaletteLevel } from './paletteTypes';

/** Rows that match `term`, best first (ties keep their order), bucketed by group in the order the groups first appear. */
export function groupCommands(source: PaletteCommand[], term: string): PaletteGroup[] {
  const matched = source
    .filter((command) => term || !command.hideWhenEmpty)
    .map((command, index) => ({ command, index, score: scoreCommand(command, term) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const byGroup = new Map<string, PaletteCommand[]>();
  for (const { command } of matched) byGroup.set(command.group, [...(byGroup.get(command.group) ?? []), command]);
  return [...byGroup].map(([title, items]) => ({ title, items }));
}

/** Each kind of search result: its first few, then "Show all N" drilling into every one; empty kinds left out. */
export function resultGroups(kinds: PaletteGroup[]): PaletteGroup[] {
  const shown = PALETTE_CONFIG.resultsPerKind;
  return kinds.filter((kind) => kind.items.length > 0).map(({ title, items }) => ({
    title,
    items: items.length <= shown ? items : [
      ...items.slice(0, shown),
      { id: `all:${title}`, title: `Show all ${items.length}`, group: title, levelTitle: title, children: () => items },
    ],
  }));
}

interface GroupsInput {
  term: string;
  level: PaletteLevel | null;
  /** Recents, actions, places and settings. */
  root: PaletteCommand[];
  /** Search results by kind, already in the index's order (from resultGroups). */
  results: PaletteGroup[];
}

/** Inside a level: its rows. At the root: everything before typing; results then the matching commands while typing. */
export function buildGroups({ term, level, root, results }: GroupsInput): PaletteGroup[] {
  const typed = term.trim();
  if (level) return groupCommands(level.commands, typed).map((group) => ({ ...group, title: '' }));
  if (!typed) return groupCommands(root, '');
  // Typed: the recents give way to the results, which lead.
  const commands = root.filter((command) => command.group !== PALETTE_CONFIG.groups.recent);
  return [...results, ...groupCommands(commands, typed)];
}
