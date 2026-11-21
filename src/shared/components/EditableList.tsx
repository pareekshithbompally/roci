/** A list the user edits, as a Settings section: on Mac and iPad an editable table with search on the section's header
 *  line once there is something to search (System Settings); on iPhone a search field, Add, then a row per match whose
 *  tap opens it (iOS Settings). Adding and opening show the caller's sheet; removing from the table needs no sheet. */

import React, { useState } from 'react';
import { CardRow, DataTable, SearchField, Section, type DataColumn } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import { UI_CONFIG } from '@config/ui.config';
import { matchesAllWords } from '@shared/utils/textMatch';

export interface EditableListProps<T> {
  title: string;
  footer?: React.ReactNode;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Mac and iPad. */
  columns: ReadonlyArray<DataColumn<T>>;
  /** iPhone: a row's title and its line beneath. */
  phoneRow: (row: T) => { title: string; description?: string };
  /** All of a row's words, for search. */
  text: (row: T) => string;
  copy: { search: string; add: string; remove: string; empty: string };
  onAdd: () => void;
  onOpen: (row: T) => void;
  onRemove: (row: T) => void;
}

export function EditableList<T>({ title, footer, rows, rowKey, columns, phoneRow, text, copy, onAdd, onOpen, onRemove }: EditableListProps<T>) {
  const [query, setQuery] = useState('');
  const phone = useFormFactor() === 'phone';
  const field = (
    <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={copy.search} className={phone ? undefined : UI_CONFIG.table.searchWidth} />
  );
  if (phone) {
    const shown = query.trim() ? rows.filter((row) => matchesAllWords(text(row), query)) : rows;
    return (
      <Section title={title} footer={footer} layout="stack">
        {field}
        <Section>
          <CardRow title={copy.add} tone="accent" onPress={onAdd} />
          {shown.map((row) => <CardRow key={rowKey(row)} {...phoneRow(row)} onPress={() => onOpen(row)} />)}
        </Section>
      </Section>
    );
  }
  return (
    <Section title={title} footer={footer} accessory={rows.length > 0 && field} layout="stack">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        label={title}
        search={{ query, text }}
        empty={copy.empty}
        edit={{ onAdd, onOpen, onRemove, addLabel: copy.add, removeLabel: copy.remove }}
      />
    </Section>
  );
}
