/** Personalization › Saved Prompts: the prompts the chat box's "/" menu offers — an editable table on Mac and iPad, a
 *  searchable list on iPhone; a prompt edits in a sheet. */

import React, { useState } from 'react';
import { Text, type DataColumn } from '@shared/ui';
import { EditableList } from '@shared/components';
import { SettingsPage } from '@features/settings/components/shared';
import { PERSONALIZATION_CONFIG, type SavedPrompt } from '@config/personalization.config';
import { useSavedPrompts } from '@features/personalization/hooks/useSavedPrompts';
import { SavedPromptDialog } from './SavedPromptDialog';

const COPY = PERSONALIZATION_CONFIG.savedPrompts.copy;
const textOf = (p: SavedPrompt) => `${p.name} ${p.prompt}`;

const COLUMNS: ReadonlyArray<DataColumn<SavedPrompt>> = [
  { key: 'name', header: COPY.columns.name, cell: (p) => <Text truncate>{p.name}</Text> },
  { key: 'prompt', header: COPY.columns.prompt, cell: (p) => <Text tone="muted" truncate>{p.prompt}</Text> },
];

/** Which prompt the sheet is open for: a new one (none), an existing one, or closed. */
type Editing = { saved?: SavedPrompt } | null;

export const SavedPromptsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { savedPrompts, save, remove } = useSavedPrompts();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <SettingsPage title={COPY.title} onBack={onBack}>
      <EditableList
        title={COPY.section}
        footer={COPY.footer}
        rows={savedPrompts}
        rowKey={(p) => p.id}
        columns={COLUMNS}
        phoneRow={(p) => ({ title: p.name, description: p.prompt })}
        text={textOf}
        copy={{ search: COPY.search, add: COPY.add, remove: COPY.remove, empty: COPY.empty }}
        onAdd={() => setEditing({})}
        onOpen={(saved) => setEditing({ saved })}
        onRemove={(p) => remove(p.id)}
      />
      {editing && <SavedPromptDialog saved={editing.saved} onSave={save} onClose={() => setEditing(null)} />}
    </SettingsPage>
  );
};
