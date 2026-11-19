/** ⌘K, after frappe/helpdesk's command palette: one ranked list of commands (recents, actions, places, settings) and, once
 *  you type, meetings and chats leading it. Rows act or drill in (Settings ›, Show All ›); Escape peels one layer — the
 *  text, then the level, then the palette — and the footer says which. Mounted beside a column sidebar (Mac, iPad). */

import React, { useEffect, useState } from 'react';
import { CommandDialog, CommandEmpty, CommandFooter, CommandGroup, CommandInput, CommandList, CommandRow, IconTile, KeyHint, Text } from '@shared/ui';
import { HighlightedText } from '@shared/components';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { SHORTCUT_KEY_LABELS } from '@config/shortcuts.config';
import { PALETTE_CONFIG } from '@config/palette.config';
import { buildGroups, resultGroups } from '@features/palette/buildGroups';
import { useRootCommands } from '@features/palette/hooks/useRootCommands';
import { useResultCommands } from '@features/palette/hooks/useResultCommands';
import type { PaletteCommand, PaletteGroup, PaletteLevel } from '@features/palette/paletteTypes';

/** The Mac's key glyphs for the footer: Return is ↩, Escape as the shortcut registry writes it. */
const KEY = { up: '↑', down: '↓', return: '↩', delete: '⌫', escape: SHORTCUT_KEY_LABELS.escape } as const;

const PaletteRow: React.FC<{ command: PaletteCommand; onRun: (command: PaletteCommand) => void }> = ({ command, onRun }) => (
  <CommandRow
    value={command.id}
    onSelect={() => onRun(command)}
    leading={command.icon ? <IconTile icon={command.icon} /> : undefined}
    label={command.highlight ? <HighlightedText text={command.title} highlight={command.highlight} emphasis="strong" /> : command.title}
    description={command.detail}
    meta={command.badge ?? command.subtitle}
    keys={command.keys}
    chevron={command.children || command.opensKind ? true : undefined}
  />
);

/** What Escape will do next, which the footer names. */
function escapeLabel(query: string, depth: number): string {
  if (query) return 'Clear';
  return depth > 0 ? 'Back' : 'Close';
}

/** Rows that are results or commands — not the "Show All" rows that only open more. */
const resultCount = (groups: PaletteGroup[]) => groups.reduce((sum, group) => sum + group.items.filter((c) => !c.opensKind).length, 0);

export const CommandPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const [stack, setStack] = useState<PaletteLevel[]>([]);
  const level = stack.at(-1) ?? null;
  const root = useRootCommands();
  // A Settings level filters its own rows; the root and a Show All level search.
  const results = useResultCommands(level && !level.kind ? '' : query, level?.kind ? PALETTE_CONFIG.allResultsLimit : undefined);

  // Back to the root as it closes, so a reopen never shows the last level for a frame.
  useEffect(() => {
    if (!open) setStack([]);
  }, [open]);

  const live = level?.kind ? { ...level, commands: results.kinds.find((group) => group.kind === level.kind)?.items ?? [] } : level;
  const groups = buildGroups({ term: query, level: live, root, results: resultGroups(results.kinds, results.capped) });
  const count = resultCount(groups);

  const back = () => setStack((levels) => levels.slice(0, -1));
  const run = (command: PaletteCommand) => {
    if (command.opensKind) {
      // Show All keeps what you typed and goes on searching it.
      setStack((levels) => [...levels, { title: command.levelTitle ?? command.title, commands: [], kind: command.opensKind }]);
      return;
    }
    if (command.children) {
      setStack((levels) => [...levels, { title: command.levelTitle ?? command.title, commands: command.children!() }]);
      setSearchQuery('');
      return;
    }
    // Closed first, so the action lands on a clean screen.
    endSearch();
    command.perform?.();
  };
  const onEscape = (event: KeyboardEvent) => {
    if (query) setSearchQuery('');
    else if (level) back();
    else return;
    event.preventDefault();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Backspace' || query || !level) return;
    event.preventDefault();
    back();
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && endSearch()} onEscapeKeyDown={onEscape} onKeyDown={onKeyDown} label="Command palette">
      <CommandInput
        look="palette"
        breadcrumb={level?.title}
        placeholder={level ? 'Search…' : 'Search meetings and chats, or type a command…'}
        value={query}
        onValueChange={setSearchQuery}
        autoFocus
      />
      <CommandList palette>
        {results.unavailable && query.trim() && (
          <Text as="p" variant="helper" tone="faint" className="px-2 py-1.5">Search is unavailable: titles only</Text>
        )}
        <CommandEmpty>{results.searching ? 'Searching…' : `No results for “${query.trim()}”`}</CommandEmpty>
        {groups.map((group, i) => (
          <CommandGroup key={`${i}:${group.title}`} heading={group.title || undefined}>
            {group.items.map((command) => <PaletteRow key={command.id} command={command} onRun={run} />)}
          </CommandGroup>
        ))}
      </CommandList>
      <CommandFooter
        trailing={(
          <>
            {query.trim() && <Text variant="helper" tone="faint">{count} {count === 1 ? 'result' : 'results'}</Text>}
            <KeyHint keys={[KEY.escape]} label={escapeLabel(query, stack.length)} />
          </>
        )}
      >
        <KeyHint keys={[KEY.up, KEY.down]} label="Navigate" />
        <KeyHint keys={[KEY.return]} label="Select" />
        {level && <KeyHint keys={[KEY.delete]} label="Back" />}
      </CommandFooter>
    </CommandDialog>
  );
};
