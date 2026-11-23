/** A list the user edits, as a Settings section: on Mac and iPad an editable table with search on the section's header
 *  line once there is something to search (System Settings); on iPhone a search field, Add, then a row per match whose
 *  tap opens it (iOS Settings). Adding and opening show the caller's sheet; removing from the table needs no sheet. */

import React, { useState } from 'react';
import { CardRow, DataTable, SearchField, Section, type DataColumn } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import { UI_CONFIG } from '@config/ui.config';
import { matchesAllWords } from '@shared/utils/textMatch';

export interface EditableListProps<T> {
  /** None when the page's bar names it. */
  title?: string;
  footer?: React.ReactNode;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Mac and iPad. */
  columns: ReadonlyArray<DataColumn<T>>;
  /** iPhone: a row's title, its line beneath, and what ends it. */
  phoneRow: (row: T) => { title: string; description?: string; value?: string };
  /** All of a row's words, for search. */
  text: (row: T) => string;
  /** `search` omitted: a list too short to search. */
  copy: { search?: string; add: string; remove: string; empty: string };
  onAdd: () => void;
  onOpen: (row: T) => void;
  onRemove: (row: T) => void;
}

export function EditableList<T>({ title, footer, rows, rowKey, columns, phoneRow, text, copy, onAdd, onOpen, onRemove }: EditableListProps<T>) {
  const [query, setQuery] = useState('');
  const phone = useFormFactor() === 'phone';
  // Nothing to search until there is something in the list (as iOS and macOS lists do).
  const field = copy.search !== undefined && rows.length > 0 && (
    <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={copy.search} className={phone ? undefined : UI_CONFIG.table.searchWidth} />
  );
  if (phone) {
    const shown = query.trim() ? rows.filter((row) => matchesAllWords(text(row), query)) : rows;
    return (
      // The search bar leads, under the page's title; the group's label sits on its card (iOS Settings).
      <div className="flex flex-col gap-4">
        {field}
        <Section title={title} footer={footer}>
          <CardRow title={copy.add} tone="accent" onPress={onAdd} />
          {shown.map((row) => <CardRow key={rowKey(row)} {...phoneRow(row)} onOpen={() => onOpen(row)} />)}
        </Section>
      </div>
    );
  }
  return (
    <Section title={title} footer={footer} accessory={field} layout="stack">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        label={title ?? copy.add}
        search={{ query, text }}
        empty={copy.empty}
        edit={{ onAdd, onOpen, onRemove, addLabel: copy.add, removeLabel: copy.remove }}
      />
    </Section>
  );
}
