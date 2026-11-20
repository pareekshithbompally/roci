/** A table of rows and columns on a card: a header in muted ink, hairlines between rows, figures aligned to the end. */

import React from 'react';
import { cn } from './utils';
import { Text } from './text';

export interface DataColumn<T> {
  key: string;
  header: string;
  /** `end` for figures, so their digits line up. */
  align?: 'start' | 'end';
  cell: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** What the table lists, for assistive tech. */
  label: string;
}

const alignClass = (align: DataColumn<unknown>['align']) => (align === 'end' ? 'text-right' : 'text-left');

export function DataTable<T>({ columns, rows, rowKey, label }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-card bg-grouped-card">
      <table aria-label={label} className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-3 py-2 font-normal', alignClass(c.align))}>
                <Text variant="caption" tone="muted">{c.header}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-muted">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2 align-middle', alignClass(c.align))}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
