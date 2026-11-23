/** A table on a card, as macOS lists it: a search field above its rows (optional), headers that sort when clicked, rows at the
 *  settings row height with hairlines between them, figures aligned to the end. Past `UI_CONFIG.table.visibleRows` rows it
 *  scrolls inside its card with the header pinned — never an endless page. Sorting and filtering are TanStack Table's.
 *  An editable table (`edit`) selects a row on click and opens it on a click of the selected row (a tap on iPad), a
 *  double-click or Return; Delete removes it; it ends in the + / − bar of a macOS list (Text Replacements, Login Items). */

import React, { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type Row, type SortingState,
} from '@tanstack/react-table';
import { UI_CONFIG } from '@config/ui.config';
import { KIT_COPY } from '@config/kitCopy.config';
import { cn } from './utils';
import { Text } from './text';
import { Icon } from './icon';
import { SearchField } from './search-field';
import { IconButton } from './button';
import { Separator } from './surface';
import { GROUPED_SURFACE } from './recipes';
import { matchesAllWords } from '@shared/utils/textMatch';

export interface DataColumn<T> {
  key: string;
  header: string;
  /** `end` for figures, so their digits line up. */
  align?: 'start' | 'end';
  cell: (row: T) => React.ReactNode;
  /** What the column sorts by; a column without one doesn't sort. */
  sortValue?: (row: T) => number | string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** What the table lists, for assistive tech. */
  label: string;
  /** Search: the words of a row it matches, and either the field above the rows (`placeholder`) or the text of a field the
   *  page shows elsewhere, such as its section's header (`query`). */
  search?: { text: (row: T) => string } & ({ placeholder: string; query?: never } | { query: string; placeholder?: never });
  /** The order it opens in: a column's key, largest first when `desc`. */
  sort?: { key: string; desc: boolean };
  /** Beside the search field: a scope bar narrowing the rows. */
  accessory?: React.ReactNode;
  /** The one line shown when there are no rows. */
  empty: string;
  /** Rows the user adds, edits and removes. */
  edit?: DataTableEdit<T>;
}

export interface DataTableEdit<T> {
  /** Opens a row's editor (double-click, Return). */
  onOpen: (row: T) => void;
  onAdd: () => void;
  onRemove: (row: T) => void;
  /** What + and − say to assistive tech ("Add Term"). */
  addLabel: string;
  removeLabel: string;
}

/** Every cell: settings row height, the card's edge inset at both ends, columns a step apart; the header is a compact strip. */
const CELL = 'h-row px-2 first:pl-4 last:pr-4';
const HEADER_CELL = 'h-7 px-2 first:pl-4 last:pr-4';
const alignClass = (align: DataColumn<unknown>['align']) => (align === 'end' ? 'text-right' : 'text-left');

/** The header of a column: its name, and when it sorts, a button that sorts it with the direction shown. */
function HeaderLabel({ header, sorted, onSort }: { header: string; sorted: false | 'asc' | 'desc'; onSort?: () => void }) {
  const label = <Text variant="caption" tone={sorted ? 'primary' : 'muted'}>{header}</Text>;
  if (!onSort) return label;
  return (
    <button type="button" onClick={onSort} className="inline-flex items-center gap-1" aria-label={KIT_COPY.sortBy(header)}>
      {label}
      {sorted && <Icon icon={sorted === 'asc' ? ChevronUp : ChevronDown} size="xs" tone="muted" />}
    </button>
  );
}

/** The + / − bar under an editable list; − acts on the selected row. */
function EditBar<T>({ edit, selected, onRemove }: { edit: DataTableEdit<T>; selected: T | undefined; onRemove: (row: T) => void }) {
  return (
    <div className="flex items-center border-t border-muted px-2 py-1">
      <IconButton icon={Plus} size="toolbar" label={edit.addLabel} onClick={edit.onAdd} />
      <Separator orientation="vertical" className="my-1.5" />
      <IconButton icon={Minus} size="toolbar" label={edit.removeLabel} disabled={!selected} onClick={() => selected && onRemove(selected)} />
    </div>
  );
}

/** An editable table's selection: one visible row (a search that hides it drops it), moved with ↑ / ↓, opened with Return,
 *  removed with Delete (⌫ or ⌦) or −, after which the next row is selected, as in a macOS list. */
function useRowSelection<T>(rows: ReadonlyArray<Row<T>>, edit: DataTableEdit<T> | undefined) {
  const tableId = useId();
  const domId = (rowId: string) => `${tableId}-row-${rowId}`;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const index = rows.findIndex((row) => row.id === selectedKey);
  const selected = rows[index]?.original;
  const select = (row: Row<T> | undefined) => {
    setSelectedKey(row?.id ?? null);
    if (row) document.getElementById(domId(row.id))?.scrollIntoView({ block: 'nearest' });
  };
  const remove = (row: T) => {
    edit?.onRemove(row);
    select(rows[index + 1] ?? rows[index - 1]);
  };
  const keys: Record<string, () => void> = {
    ArrowDown: () => select(rows[Math.min(index + 1, rows.length - 1)]),
    ArrowUp: () => select(rows[Math.max(index - 1, 0)]),
    Enter: () => selected && edit?.onOpen(selected),
    Backspace: () => selected && remove(selected),
    Delete: () => selected && remove(selected),
  };
  // Keys pressed on the table itself, not on a control inside it (a header that sorts).
  const onKeyDown = (event: React.KeyboardEvent) => {
    const action = keys[event.key];
    if (!action || event.target !== event.currentTarget) return;
    event.preventDefault();
    action();
  };
  // A row's element id: for `aria-activedescendant` and scrolling the selection into view.
  return { selectedKey, selected, select, remove, onKeyDown, domId };
}

export function DataTable<T>({ columns, rows, rowKey, label, search, sort, accessory, empty, edit }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(sort ? [{ id: sort.key, desc: sort.desc }] : []);
  const [ownQuery, setQuery] = useState('');
  const query = search?.query ?? ownQuery;
  const ownField = search && search.query === undefined;
  const defs = useMemo<Array<ColumnDef<T>>>(() => columns.map((c) => ({
    id: c.key,
    accessorFn: c.sortValue ?? (() => 0),
    // Names sort A→Z first, figures largest first (TanStack's default by the value's type), as Finder columns do.
    enableSorting: !!c.sortValue,
  })), [columns]);
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const table = useReactTable({
    data: rows as T[],
    columns: defs,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    // A column toggles between its two orders; it never goes back to unsorted (macOS tables).
    enableSortingRemoval: false,
    onGlobalFilterChange: setQuery,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, _column, value: string) => !search || !value.trim() || matchesAllWords(search.text(row.original), value),
    getRowId: (row) => rowKey(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const shown = table.getRowModel().rows;
  const selection = useRowSelection(shown, edit);

  return (
    <div className={cn('overflow-hidden', GROUPED_SURFACE)}>
      {(ownField || accessory || query) && (
        // The scope bar leads; the search field trails, short, with its match count before it (macOS toolbars). The count
        // also shows, and is announced, while a field elsewhere (the section's header) searches.
        <div className="flex items-center gap-3 px-4 py-2">
          {accessory}
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {query && <Text variant="caption" tone="muted" role="status">{`${shown.length} of ${rows.length}`}</Text>}
            {ownField && (
              <SearchField
                value={query}
                onChange={setQuery}
                onCancel={() => setQuery('')}
                placeholder={search.placeholder}
                className={cn('min-w-0', UI_CONFIG.table.searchWidth)}
              />
            )}
          </div>
        </div>
      )}
      {/* One row more than shown: the header row. */}
      <div className="overflow-y-auto" style={{ maxHeight: `calc(var(--row-min-h) * ${UI_CONFIG.table.visibleRows + 1})` }}>
        <table
          aria-label={label}
          className="w-full border-collapse outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          {...(edit && {
            role: 'grid',
            tabIndex: 0,
            onKeyDown: selection.onKeyDown,
            'aria-activedescendant': selection.selectedKey ? selection.domId(selection.selectedKey) : undefined,
          })}
        >
          <thead className="sticky top-0 z-10 bg-grouped-card">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((h) => {
                  const column = byKey.get(h.column.id);
                  return (
                    <th key={h.id} scope="col" className={cn(HEADER_CELL, 'font-normal', alignClass(column?.align))}>
                      <HeaderLabel
                        header={column?.header ?? ''}
                        sorted={h.column.getIsSorted()}
                        onSort={h.column.getCanSort() ? () => h.column.toggleSorting(undefined, false) : undefined}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                className={cn('border-t border-muted', edit && (row.id === selection.selectedKey ? 'bg-pressed' : 'hover:bg-hover'))}
                {...(edit && {
                  id: selection.domId(row.id),
                  'aria-selected': row.id === selection.selectedKey,
                  onClick: () => (row.id === selection.selectedKey ? edit.onOpen(row.original) : selection.select(row)),
                  onDoubleClick: () => edit.onOpen(row.original),
                })}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn(CELL, 'align-middle', alignClass(byKey.get(cell.column.id)?.align))}>
                    {flexRender(() => byKey.get(cell.column.id)?.cell(row.original), cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr className="border-t border-muted">
                <td colSpan={columns.length} className={cn(CELL, 'text-center')}><Text variant="helper" tone="muted">{empty}</Text></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && <EditBar edit={edit} selected={selection.selected} onRemove={selection.remove} />}
    </div>
  );
}
