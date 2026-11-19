/** ⌘K, after frappe/helpdesk's command palette: one ranked list of commands (recents, actions, places, settings) and, once
 *  you type, meetings and chats leading it. Rows act or drill in (Settings ›, Show all ›); Escape peels one layer — the
 *  text, then the level, then the palette — and the footer says which. Mounted beside a column sidebar (Mac, iPad). */

import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  CommandDialog, CommandGroup, CommandInput, CommandList, CommandRow, Icon, IconTile, KeyHint, Separator, Text,
} from '@shared/ui';
import { HighlightedText } from '@shared/components';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { buildGroups, resultGroups } from '@features/palette/buildGroups';
import { useRootCommands } from '@features/palette/hooks/useRootCommands';
import { useResultCommands } from '@features/palette/hooks/useResultCommands';
import type { PaletteCommand, PaletteLevel } from '@features/palette/paletteTypes';

const Row: React.FC<{ command: PaletteCommand; onRun: (command: PaletteCommand) => void }> = ({ command, onRun }) => (
  <CommandRow
    value={command.id}
    onSelect={() => onRun(command)}
    leading={command.icon ? <IconTile icon={command.icon} /> : undefined}
    label={command.highlight ? <HighlightedText text={command.title} highlight={command.highlight} emphasis="strong" /> : command.title}
    description={command.detail}
    meta={command.badge ?? command.subtitle}
    keys={command.keys}
    chevron={command.children ? true : undefined}
  />
);

/** What Escape will do next, which the footer names. */
function escapeLabel(query: string, depth: number): string {
  if (query) return 'Clear';
  return depth > 0 ? 'Back' : 'Close';
}

export const CommandPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const [stack, setStack] = useState<PaletteLevel[]>([]);
  const level = stack.at(-1) ?? null;
  const root = useRootCommands();
  const results = useResultCommands(level ? '' : query);

  // Every open starts at the root.
  useEffect(() => {
    if (open) setStack([]);
  }, [open]);

  const groups = buildGroups({ term: query, level, root, results: resultGroups(results.kinds) });
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);

  const back = () => setStack((levels) => levels.slice(0, -1));
  const run = (command: PaletteCommand) => {
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
        placeholder={level ? 'Search…' : 'Search meetings and chats, or type a command…'}
        breadcrumb={level && (
          <span className="flex shrink-0 items-center gap-1">
            <Text variant="label">{level.title}</Text>
            <Icon icon={ChevronRight} size="xs" tone="faint" />
          </span>
        )}
        value={query}
        onValueChange={setSearchQuery}
        autoFocus
      />
      <CommandList palette>
        {count === 0 && (
          <Text as="p" variant="helper" tone="faint" className="px-3 py-6 text-center">
            {results.searching ? 'Searching…' : `No results for “${query.trim()}”`}
          </Text>
        )}
        {groups.map((group, i) => (
          <CommandGroup key={`${i}:${group.title}`} heading={group.title || undefined}>
            {group.items.map((command) => <Row key={command.id} command={command} onRun={run} />)}
          </CommandGroup>
        ))}
      </CommandList>
      <Separator />
      <div className="flex items-center gap-4 px-4 py-2.5">
        <KeyHint keys={['↑', '↓']} label="Navigate" />
        <KeyHint keys={['↵']} label="Select" />
        {level && <KeyHint keys={['⌫']} label="Back" />}
        <span className="ml-auto flex items-center gap-4">
          {query.trim() && <Text variant="helper" tone="faint">{count} results</Text>}
          <KeyHint keys={['esc']} label={escapeLabel(query, stack.length)} />
        </span>
      </div>
    </CommandDialog>
  );
};
