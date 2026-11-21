/** Add or edit one vocabulary term: the term and its "sounds like" spellings; editing also offers Delete Term. */

import React, { useState } from 'react';
import { Button } from '@shared/ui';
import { FormDialog, SettingsInput } from '@shared/components';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { addTerm, parseSoundsLike, removeTerm, updateTerm } from '@features/personalization/utils/vocabulary';
import type { VocabularyEntry } from '@shared/types';

const COPY = PERSONALIZATION_CONFIG.copy.vocabulary;
/** Links the footer's Add/Save button to the form, so Return in either field saves (as in a native sheet). */
const FORM_ID = 'vocabulary-term';

interface TermDialogProps {
  /** The term being edited; none adds a new one. */
  entry?: VocabularyEntry;
  vocabulary: VocabularyEntry[];
  onSave: (vocabulary: VocabularyEntry[]) => void;
  onClose: () => void;
}

export const TermDialog: React.FC<TermDialogProps> = ({ entry, vocabulary, onSave, onClose }) => {
  const [term, setTerm] = useState(entry?.term ?? '');
  const [soundsLike, setSoundsLike] = useState(entry?.soundsLike.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const spellings = parseSoundsLike(soundsLike);
    const result = entry ? updateTerm(vocabulary, entry.term, term, spellings) : addTerm(vocabulary, term, spellings);
    if ('error' in result) return setError(result.error);
    onSave(result.list);
    onClose();
  };

  const remove = () => {
    if (!entry) return;
    onSave(removeTerm(vocabulary, entry.term));
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={entry ? COPY.edit : COPY.add}
      size="md"
      error={error}
      footer={
        <>
          {entry && <Button variant="dangerGhost" onClick={remove} className="mr-auto">{COPY.delete}</Button>}
          <Button variant="ghost" onClick={onClose}>{COPY.cancel}</Button>
          <Button type="submit" form={FORM_ID} disabled={!term.trim()}>{entry ? COPY.save : COPY.confirmAdd}</Button>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <SettingsInput
          label={COPY.term}
          value={term}
          placeholder={COPY.termPlaceholder}
          onChange={(e) => { setTerm(e.target.value); setError(null); }}
          autoFocus
        />
        <SettingsInput
          label={COPY.soundsLike}
          value={soundsLike}
          placeholder={COPY.soundsLikePlaceholder}
          helper={COPY.soundsLikeHelper}
          onChange={(e) => { setSoundsLike(e.target.value); setError(null); }}
        />
      </form>
    </FormDialog>
  );
};
