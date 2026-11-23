/** Records to look through: a Mac's table; on iPhone a searchable list whose rows push a record's own page — its remaining
 *  columns as rows, or the caller's page (`onOpen`). */

import React, { useMemo, useState } from 'react';
import { CardRow, DataTable, PageBody, PushedScreen, SearchField, Section, Text, useOptionalNavStack, type DataTableProps } from '@shared/ui';
import { matchesAllWords } from '@shared/utils/textMatch';
import { useFormFactor } from '@platform/formFactor';

export interface RecordRow {
  title: string;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  value?: string;
}

export interface RecordListProps<T> extends Omit<DataTableProps<T>, 'edit'> {
  /** iPhone: the record's row. */
  phoneRow: (row: T) => RecordRow;
  /** iPhone: opens the caller's page for a record instead of its columns; a record `canOpen` refuses has no page. */
  onOpen?: (row: T) => void;
  canOpen?: (row: T) => boolean;
}

export function RecordList<T>({ phoneRow, onOpen, canOpen, ...table }: RecordListProps<T>) {
  return useFormFactor() === 'phone'
    ? <PhoneRecords {...table} phoneRow={phoneRow} onOpen={onOpen} canOpen={canOpen} />
    : <DataTable {...table} />;
}

type Sort<T> = Pick<DataTableProps<T>, 'rows' | 'columns' | 'sort'>;

/** The table's opening order. */
function sorted<T>({ rows, columns, sort }: Sort<T>): readonly T[] {
  const valueOf = columns.find((c) => c.key === sort?.key)?.sortValue;
  if (!valueOf) return rows;
  const order = (a: T, b: T) => (valueOf(a) < valueOf(b) ? -1 : valueOf(a) > valueOf(b) ? 1 : 0);
  return [...rows].sort((a, b) => (sort?.desc ? order(b, a) : order(a, b)));
}

function PhoneRecords<T>({ columns, rows, rowKey, label, search, sort, accessory, empty, phoneRow, onOpen, canOpen }: RecordListProps<T>) {
  const [ownQuery, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const query = search?.query ?? ownQuery;
  const ordered = useMemo(() => sorted({ rows, columns, sort }), [rows, columns, sort]);
  const shown = search && query.trim() ? ordered.filter((row) => matchesAllWords(search.text(row), query)) : ordered;
  const open = rows.find((row) => rowKey(row) === openKey);
  // A record's own page needs a stack to push onto (Settings); elsewhere only the caller's page opens one.
  const pushes = useOptionalNavStack() !== null;

  const openRow = (row: T) => (onOpen ? onOpen(row) : setOpenKey(rowKey(row)));

  return (
    <>
      <div className="flex flex-col gap-4">
        {search?.placeholder && <SearchField value={ownQuery} onChange={setQuery} onCancel={() => setQuery('')} placeholder={search.placeholder} />}
        {accessory}
        <Section aria-label={label}>
          {shown.length === 0 && <CardRow title={<Text tone="muted">{empty}</Text>} />}
          {shown.map((row) => (
            <CardRow key={rowKey(row)} {...phoneRow(row)} onOpen={canOpen?.(row) === false || (!onOpen && !pushes) ? undefined : () => openRow(row)} />
          ))}
        </Section>
      </div>
      {pushes && <PushedScreen open={!!open} title={open ? phoneRow(open).title : ''} onClose={() => setOpenKey(null)}>
        <PageBody>
          {open && (
            <Section>
              {columns.slice(1).map((c) => <CardRow key={c.key} title={c.header} actions={c.cell(open)} />)}
            </Section>
          )}
        </PageBody>
      </PushedScreen>}
    </>
  );
}
