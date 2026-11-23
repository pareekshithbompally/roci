/** Add or edit one saved prompt: its name (what the "/" menu shows) and its text. */

import React, { useState } from 'react';
import { Section } from '@shared/ui';
import { FieldRow, FormDialog } from '@shared/components';
import { PERSONALIZATION_CONFIG, type SavedPrompt } from '@config/personalization.config';

const { copy: COPY, limits } = PERSONALIZATION_CONFIG.savedPrompts;
interface SavedPromptDialogProps {
  /** The prompt being edited; none adds one. */
  saved?: SavedPrompt;
  onSave: (prompt: SavedPrompt) => void;
  onClose: () => void;
}

export const SavedPromptDialog: React.FC<SavedPromptDialogProps> = ({ saved, onSave, onClose }) => {
  const [name, setName] = useState(saved?.name ?? '');
  const [prompt, setPrompt] = useState(saved?.prompt ?? '');
  const ready = name.trim() !== '' && prompt.trim() !== '';
  const save = () => {
    onSave({ id: saved?.id ?? crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() });
    onClose();
  };
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={saved ? COPY.edit : COPY.add}
      dirty={name !== (saved?.name ?? '') || prompt !== (saved?.prompt ?? '')}
      submit={{ label: COPY.save, onPress: save, disabled: !ready }}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (ready) save(); }}>
        <Section>
          <FieldRow typed autoFocus title={COPY.name} value={name} maxLength={limits.name} placeholder={COPY.namePlaceholder} onChange={setName} />
          <FieldRow typed lines={6} title={COPY.prompt} value={prompt} maxLength={limits.prompt} placeholder={COPY.promptPlaceholder} onChange={setPrompt} />
        </Section>
      </form>
    </FormDialog>
  );
};
