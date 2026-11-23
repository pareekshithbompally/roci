/** A list of typed entries (HTTP headers, environment variables, arguments): name and hidden value, or a value alone.
 *  Adding or opening one shows its form; deleting is in that form (iPhone) or the list's − (Mac). */

import React, { useState } from 'react';
import { Section, Text, type DataColumn } from '@shared/ui';
import { EditableList, FieldRow, FormDialog } from '@shared/components';
import { KIT_COPY } from '@config/kitCopy.config';

export type KeyValuePair = [key: string, value: string];

export interface EntryListCopy {
  add: string;
  edit: string;
  remove: string;
  empty: string;
  value: string;
  /** Entries without a name (arguments) have none. */
  name?: string;
}

interface EntryListProps {
  /** Shown above the list; none when the page's bar names it. */
  title?: string;
  entries: readonly KeyValuePair[];
  onChange: (entries: KeyValuePair[]) => void;
  copy: EntryListCopy;
}

interface EntryRow {
  index: number;
  name: string;
  value: string;
}

const columnsFor = (copy: EntryListCopy): ReadonlyArray<DataColumn<EntryRow>> => [
  ...(copy.name ? [{ key: 'name', header: copy.name, cell: (row: EntryRow) => <Text truncate>{row.name}</Text> }] : []),
  { key: 'value', header: copy.value, cell: (row) => <Text truncate tone={copy.name ? 'muted' : undefined}>{copy.name ? KIT_COPY.hidden : row.value}</Text> },
];

export const EntryList: React.FC<EntryListProps> = ({ title, entries, onChange, copy }) => {
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const rows = entries.map(([name, value], index) => ({ index, name, value }));
  const without = (index: number) => entries.filter((_, i) => i !== index);

  const save = ({ index, name, value }: EntryRow) => {
    const entry: KeyValuePair = [name.trim(), value.trim()];
    onChange(index < entries.length ? entries.map((e, i) => (i === index ? entry : e)) : [...entries, entry]);
    setEditing(null);
  };
  const remove = (row: EntryRow) => {
    onChange(without(row.index));
    setEditing(null);
  };

  return (
    <>
      <EditableList
        title={title}
        rows={rows}
        rowKey={(row) => String(row.index)}
        columns={columnsFor(copy)}
        phoneRow={(row) => (copy.name ? { title: row.name, value: KIT_COPY.hidden } : { title: row.value })}
        text={(row) => row.name}
        copy={copy}
        onAdd={() => setEditing({ index: entries.length, name: '', value: '' })}
        onOpen={(row) => setEditing(row)}
        onRemove={remove}
      />
      {editing && (
        <EntryForm entry={editing} isNew={editing.index >= entries.length} copy={copy} onSave={save} onRemove={remove} onClose={() => setEditing(null)} />
      )}
    </>
  );
};

interface EntryFormProps {
  entry: EntryRow;
  isNew: boolean;
  copy: EntryListCopy;
  onSave: (entry: EntryRow) => void;
  onRemove: (entry: EntryRow) => void;
  onClose: () => void;
}

const EntryForm: React.FC<EntryFormProps> = ({ entry, isNew, copy, onSave, onRemove, onClose }) => {
  const [draft, setDraft] = useState(entry);
  const dirty = draft.name !== entry.name || draft.value !== entry.value;
  const complete = (!copy.name || draft.name.trim() !== '') && draft.value.trim() !== '';
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? copy.add : copy.edit}
      size="md"
      dirty={dirty}
      submit={{ label: KIT_COPY.save, onPress: () => onSave(draft), disabled: !dirty || !complete }}
      aside={isNew ? undefined : { label: copy.remove, tone: 'danger', onPress: () => onRemove(entry) }}
    >
      <Section>
        {copy.name && <FieldRow typed literal autoFocus title={copy.name} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />}
        <FieldRow typed literal autoFocus={!copy.name} kind={copy.name ? 'secret' : 'text'} title={copy.value} value={draft.value} onChange={(value) => setDraft({ ...draft, value })} />
      </Section>
    </FormDialog>
  );
};

/** Drop blank keys and trim; the inverse of `Object.entries`. */
export function pairsToRecord(pairs: readonly KeyValuePair[]): Record<string, string> {
  return Object.fromEntries(
    pairs.map(([k, v]) => [k.trim(), v.trim()] as const).filter(([k]) => k !== ''),
  );
}
