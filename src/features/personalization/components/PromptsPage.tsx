/** Personalization › Prompts: About You, Responses, Custom Instructions (each saved as typed), the prompt templates (each edits
 *  in a sheet), and the effective chat prompt. */

import React, { useState } from 'react';
import { Badge, CardRow, ChoiceControl, Section } from '@shared/ui';
import { SettingsPage } from '@features/settings/components/shared';
import { FieldRow } from '@shared/components';
import { PERSONALIZATION_CONFIG, type PromptTemplateId } from '@config/personalization.config';
import { usePromptSettings } from '@features/personalization/hooks/usePromptSettings';
import { TemplateDialog } from './TemplateDialog';
import { PromptPreviewDialog } from './PromptPreviewDialog';

const { copy, limits, lengths, tones, formats, defaults, templates: TEMPLATES } = PERSONALIZATION_CONFIG.prompts;

const AboutYou: React.FC = () => {
  const { profile, setProfile } = usePromptSettings();
  return (
    <Section title={copy.about.section} footer={copy.about.footer}>
      <FieldRow title={copy.about.name} value={profile.name ?? ''} maxLength={limits.name} placeholder={copy.about.namePlaceholder} onChange={(name) => setProfile({ name })} />
      <FieldRow title={copy.about.about} lines={3} value={profile.about ?? ''} maxLength={limits.about} placeholder={copy.about.aboutPlaceholder} onChange={(about) => setProfile({ about })} />
    </Section>
  );
};

const Responses: React.FC = () => {
  const { responses, setResponses, templates } = usePromptSettings();
  // An edited Chat Answer Style replaces what these write, so they say so rather than seem to do nothing.
  const footer = templates.chatStyle ? copy.responses.edited : copy.responses.footer;
  return (
    <Section title={copy.responses.section} footer={footer}>
      <CardRow title={copy.responses.length} disabled={!!templates.chatStyle} actions={<ChoiceControl items={lengths} value={responses.length ?? defaults.length} onValueChange={(length) => setResponses({ length })} label={copy.responses.length} />} />
      <CardRow title={copy.responses.tone} disabled={!!templates.chatStyle} actions={<ChoiceControl items={tones} value={responses.tone ?? defaults.tone} onValueChange={(tone) => setResponses({ tone })} label={copy.responses.tone} />} />
      <CardRow title={copy.responses.format} disabled={!!templates.chatStyle} actions={<ChoiceControl items={formats} value={responses.format ?? defaults.format} onValueChange={(format) => setResponses({ format })} label={copy.responses.format} />} />
    </Section>
  );
};

const CustomInstructions: React.FC = () => {
  const { customInstructions, setCustomInstructions } = usePromptSettings();
  return (
    <Section footer={copy.instructions.footer}>
      <FieldRow title={copy.instructions.section} lines={5} value={customInstructions} maxLength={limits.customInstructions} placeholder={copy.instructions.placeholder} onChange={setCustomInstructions} />
    </Section>
  );
};

const Templates: React.FC<{ onEdit: (id: PromptTemplateId, label: string) => void }> = ({ onEdit }) => {
  const { templates } = usePromptSettings();
  return (
    <Section title={copy.templates.section} footer={copy.templates.footer}>
      {TEMPLATES.map(({ id, label }) => (
        <CardRow key={id} title={label} status={templates[id] && <Badge>{copy.templates.edited}</Badge>} onOpen={() => onEdit(id, label)} />
      ))}
    </Section>
  );
};

export const PromptsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [editing, setEditing] = useState<{ id: PromptTemplateId; label: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  return (
    <SettingsPage title={copy.title} onBack={onBack}>
      <AboutYou />
      <Responses />
      <CustomInstructions />
      <Templates onEdit={(id, label) => setEditing({ id, label })} />
      <Section>
        <CardRow title={copy.preview.open} onOpen={() => setPreviewing(true)} />
      </Section>
      {editing && <TemplateDialog id={editing.id} label={editing.label} onClose={() => setEditing(null)} />}
      {previewing && <PromptPreviewDialog onClose={() => setPreviewing(false)} />}
    </SettingsPage>
  );
};
