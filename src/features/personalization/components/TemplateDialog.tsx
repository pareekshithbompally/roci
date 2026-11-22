/** Edit one prompt template: the user's rewrite, or Roci's text to start from; Reset to Default restores Roci's text. */

import React, { useState } from 'react';
import { Textarea } from '@shared/ui';
import { FormDialog } from '@shared/components';
import { PERSONALIZATION_CONFIG, type PromptTemplateId } from '@config/personalization.config';
import { promptTemplateDefault } from '@core/ai';
import { usePromptSettings } from '@features/personalization/hooks/usePromptSettings';

const { copy, limits } = PERSONALIZATION_CONFIG.prompts;
const COPY = copy.templates;

interface TemplateDialogProps {
  id: PromptTemplateId;
  label: string;
  onClose: () => void;
}

export const TemplateDialog: React.FC<TemplateDialogProps> = ({ id, label, onClose }) => {
  const { templates, responses, setTemplate } = usePromptSettings();
  const fallback = promptTemplateDefault(id, responses);
  const [text, setText] = useState(templates[id] ?? fallback);
  const tooLong = text.length > limits.template;

  const save = () => {
    // Roci's own text is stored as no rewrite, so its default keeps following the user's preferences.
    setTemplate(id, text.trim() === fallback.trim() ? undefined : text);
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={COPY.edit(label)}
      error={tooLong ? COPY.tooLong(limits.template) : null}
      submit={{ label: COPY.save, onPress: save, disabled: tooLong || !text.trim() }}
      aside={{ label: COPY.reset, onPress: () => setText(fallback), disabled: text === fallback }}
    >
      <Textarea variant="code" value={text} onChange={(e) => setText(e.target.value)} aria-label={label} autoFocus />
    </FormDialog>
  );
};
