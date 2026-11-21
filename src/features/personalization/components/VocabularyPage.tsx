/** Personalization › Vocabulary: the recognition boost, then the custom vocabulary — an editable table on Mac and iPad
 *  (macOS Text Replacements), a searchable list on iPhone (iOS Text Replacement); a term edits in a sheet. */

import React, { useState } from 'react';
import { CardRow, ChoiceControl, Section, Text, type DataColumn } from '@shared/ui';
import { EditableList } from '@shared/components';
import { SettingsPage } from '@features/settings/components/shared';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { entryText, removeTerm } from '@features/personalization/utils/vocabulary';
import type { VocabularyEntry } from '@shared/types';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';
import { TermDialog } from './TermDialog';

const { copy, recognitionBoosts } = PERSONALIZATION_CONFIG;
const COPY = copy.vocabulary;

/** Which term the sheet is open for: a new one (no entry), an existing one, or closed. */
type Editing = { entry?: VocabularyEntry } | null;

/** Rows in priority order (no column sorts, so the order shown is the order used). */
const COLUMNS: ReadonlyArray<DataColumn<VocabularyEntry>> = [
  { key: 'term', header: COPY.term, cell: (entry) => <Text truncate>{entry.term}</Text> },
  { key: 'soundsLike', header: COPY.soundsLike, cell: (entry) => <Text tone="muted" truncate>{entry.soundsLike.join(', ')}</Text> },
];

export const VocabularyPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { vocabulary, setVocabulary, recognitionBoost, setRecognitionBoost } = usePersonalization();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <SettingsPage title={COPY.title} onBack={onBack}>
      <Section title={copy.recognition.section} footer={copy.recognition.footer}>
        <CardRow
          title={copy.recognition.boost}
          actions={
            <ChoiceControl items={recognitionBoosts} value={recognitionBoost} onValueChange={setRecognitionBoost} label={copy.recognition.boost} />
          }
        />
      </Section>

      <EditableList
        title={COPY.section}
        footer={COPY.footer}
        rows={vocabulary}
        rowKey={(entry) => entry.term}
        columns={COLUMNS}
        phoneRow={(entry) => ({ title: entry.term, description: entry.soundsLike.join(', ') || undefined })}
        text={entryText}
        copy={{ search: COPY.search, add: COPY.add, remove: COPY.remove, empty: COPY.emptyList }}
        onAdd={() => setEditing({})}
        onOpen={(entry) => setEditing({ entry })}
        onRemove={(entry) => setVocabulary(removeTerm(vocabulary, entry.term))}
      />

      {editing && <TermDialog entry={editing.entry} vocabulary={vocabulary} onSave={setVocabulary} onClose={() => setEditing(null)} />}
    </SettingsPage>
  );
};
