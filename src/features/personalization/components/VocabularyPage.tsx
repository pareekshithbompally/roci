/** Personalization › Vocabulary: the spoken language and recognition boost, then the custom vocabulary — an editable table on Mac and iPad
 *  (macOS Text Replacements), a searchable list on iPhone (iOS Text Replacement); a term edits in a sheet. */

import React, { useState } from 'react';
import { CardRow, ChoiceControl, Picker, Section, Text, type DataColumn, type PickerGroup } from '@shared/ui';
import { EditableList } from '@shared/components';
import { SettingsPage } from '@features/settings/components/shared';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { LAYOUT } from '@config/layout.config';
import { entryText, removeTerm } from '@features/personalization/utils/vocabulary';
import type { VocabularyEntry } from '@shared/types';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';
import { useSpokenLanguages, type SpokenLanguages } from '@features/personalization/hooks/useSpokenLanguages';
import { deviceLanguage, languageName, matchLanguage } from '@shared/utils/spokenLanguage';
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

/** The menu's value for Automatic (the device's language): no saved choice. */
const AUTOMATIC = 'automatic';

/** Automatic, then the model's languages by name. */
function languageGroups(languages: string[]): PickerGroup[] {
  const named = languages.map((code) => ({ value: code, label: languageName(code) })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ options: [{ value: AUTOMATIC, label: copy.recognition.automatic(languageName(deviceLanguage())) }] }, { options: named }];
}

/** Says what the model writes, or that it needs a language it takes. */
function languageNote(spoken: SpokenLanguages, chosen: string | undefined): string {
  const taken = spoken.detects || matchLanguage(chosen ?? deviceLanguage(), spoken.languages) !== undefined;
  return taken ? copy.recognition.writes(spoken.model) : copy.recognition.needsChoice(spoken.model);
}

const SpokenLanguageRow: React.FC<{ spoken: SpokenLanguages }> = ({ spoken }) => {
  const { spokenLanguage, setSpokenLanguage } = usePersonalization();
  const value = spokenLanguage ? (matchLanguage(spokenLanguage, spoken.languages) ?? spokenLanguage) : AUTOMATIC;
  return (
    <CardRow
      title={copy.recognition.language}
      description={languageNote(spoken, spokenLanguage)}
      actions={
        <div className={LAYOUT.capabilityPicker}>
          <Picker
            label={copy.recognition.language}
            value={value}
            onChange={(next) => setSpokenLanguage(next === AUTOMATIC ? undefined : next)}
            placeholder=""
            groups={languageGroups(spoken.languages)}
          />
        </div>
      }
    />
  );
};

export const VocabularyPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { vocabulary, setVocabulary, recognitionBoost, setRecognitionBoost } = usePersonalization();
  const spoken = useSpokenLanguages();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <SettingsPage title={COPY.title} onBack={onBack}>
      <Section title={copy.recognition.section} footer={copy.recognition.footer}>
        {spoken && <SpokenLanguageRow spoken={spoken} />}
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
