/** Add or edit one saved prompt: its name (what the "/" menu shows) and its text. */

import React, { useState } from 'react';
import { Textarea } from '@shared/ui';
import { FormDialog, SettingsInput } from '@shared/components';
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
      submit={{ label: COPY.save, onPress: save, disabled: !ready }}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) save(); }}>
        <SettingsInput label={COPY.name} value={name} maxLength={limits.name} placeholder={COPY.namePlaceholder} onChange={(e) => setName(e.target.value)} autoFocus />
        <Textarea rows={6} value={prompt} maxLength={limits.prompt} placeholder={COPY.promptPlaceholder} aria-label={COPY.prompt} onChange={(e) => setPrompt(e.target.value)} />
      </form>
    </FormDialog>
  );
};
