/** Add or edit one vocabulary term: the term and its "sounds like" spellings; editing also offers Delete Term. */

import React, { useState } from 'react';
import { Section } from '@shared/ui';
import { FieldRow, FormDialog } from '@shared/components';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { addTerm, parseSoundsLike, removeTerm, updateTerm } from '@features/personalization/utils/vocabulary';
import type { VocabularyEntry } from '@shared/types';

const COPY = PERSONALIZATION_CONFIG.copy.vocabulary;

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
      dirty={term !== (entry?.term ?? '') || soundsLike !== (entry?.soundsLike.join(', ') ?? '')}
      submit={{ label: entry ? COPY.save : COPY.confirmAdd, onPress: save, disabled: !term.trim() }}
      aside={entry ? { label: COPY.delete, onPress: remove, tone: 'danger' } : undefined}
    >
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Section footer={COPY.soundsLikeHelper}>
          <FieldRow typed autoFocus title={COPY.term} value={term} placeholder={COPY.termPlaceholder} onChange={(next) => { setTerm(next); setError(null); }} />
          <FieldRow typed title={COPY.soundsLike} value={soundsLike} placeholder={COPY.soundsLikePlaceholder} onChange={(next) => { setSoundsLike(next); setError(null); }} />
        </Section>
      </form>
    </FormDialog>
  );
};
