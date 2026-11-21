/** A table on a card, as macOS lists it: a search field above its rows (optional), headers that sort when clicked, rows at the
 *  settings row height with hairlines between them, figures aligned to the end. Past `UI_CONFIG.table.visibleRows` rows it
 *  scrolls inside its card with the header pinned — never an endless page. Sorting and filtering are TanStack Table's. */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { UI_CONFIG } from '@config/ui.config';
import { cn } from './utils';
import { Text } from './text';
import { Icon } from './icon';
import { SearchField } from './search-field';
import { GROUPED_SURFACE } from './recipes';

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
  /** A search field above the rows: what it says, and the words of a row it matches. */
  search?: { placeholder: string; text: (row: T) => string };
  /** The order it opens in: a column's key, largest first when `desc`. */
  sort?: { key: string; desc: boolean };
  /** Beside the search field: a scope bar narrowing the rows. */
  accessory?: React.ReactNode;
  /** The one line shown when there are no rows. */
  empty: string;
}

/** Every cell: settings row height, the card's edge inset at both ends, columns a step apart. */
const CELL = 'h-row px-2 first:pl-4 last:pr-4';
const alignClass = (align: DataColumn<unknown>['align']) => (align === 'end' ? 'text-right' : 'text-left');

/** The header of a column: its name, and when it sorts, a button that sorts it with the direction shown. */
function HeaderLabel({ header, sorted, onSort }: { header: string; sorted: false | 'asc' | 'desc'; onSort?: () => void }) {
  const label = <Text variant="caption" tone={sorted ? 'primary' : 'muted'}>{header}</Text>;
  if (!onSort) return label;
  return (
    <button type="button" onClick={onSort} className="inline-flex items-center gap-1" aria-label={`Sort by ${header}`}>
      {label}
      {sorted && <Icon icon={sorted === 'asc' ? ChevronUp : ChevronDown} size="xs" tone="muted" />}
    </button>
  );
}

export function DataTable<T>({ columns, rows, rowKey, label, search, sort, accessory, empty }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(sort ? [{ id: sort.key, desc: sort.desc }] : []);
  const [query, setQuery] = useState('');
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
    globalFilterFn: (row, _column, value: string) => !search || search.text(row.original).toLowerCase().includes(value.trim().toLowerCase()),
    getRowId: (row) => rowKey(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const shown = table.getRowModel().rows;

  return (
    <div className={cn('overflow-hidden', GROUPED_SURFACE)}>
      {(search || accessory) && (
        <div className="flex items-center gap-3 px-4 py-2">
          {search && <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={search.placeholder} className="min-w-0 flex-1" />}
          {query && <Text variant="caption" tone="muted">{`${shown.length} of ${rows.length}`}</Text>}
          {accessory}
        </div>
      )}
      {/* One row more than shown: the header row. */}
      <div className="overflow-y-auto" style={{ maxHeight: `calc(var(--row-min-h) * ${UI_CONFIG.table.visibleRows + 1})` }}>
        <table aria-label={label} className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-grouped-card">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((h) => {
                  const column = byKey.get(h.column.id);
                  return (
                    <th key={h.id} scope="col" className={cn(CELL, 'font-normal', alignClass(column?.align))}>
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
              <tr key={row.id} className="border-t border-muted">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn(CELL, 'align-middle', alignClass(byKey.get(cell.column.id)?.align))}>
                    {flexRender(() => byKey.get(cell.column.id)?.cell(row.original), cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr className="border-t border-muted">
                <td colSpan={columns.length} className={cn(CELL, 'text-center')}><Text tone="muted">{empty}</Text></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
