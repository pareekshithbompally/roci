/** Add or edit one memory: its text, who or what it is about (you, or a named person, organization, project or event), and
 *  whether it is pinned (pinned memories are always in chat's prompt). */

import React, { useState } from 'react';
import { CardRow, Picker, Section, Switch } from '@shared/ui';
import { FieldRow, FormDialog } from '@shared/components';
import { LAYOUT } from '@config/layout.config';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { KNOWLEDGE_LIMITS } from '@config/knowledge.config';
import type { MemoryEntityRow, MemoryInput, MemoryRow } from '@shared/types/native';

const COPY = PERSONALIZATION_CONFIG.memory.copy;
const YOU = 'you';

interface MemoryDialogProps {
  /** The memory being edited; none adds one. */
  memory?: MemoryRow;
  entities: readonly MemoryEntityRow[];
  onSave: (memory: MemoryInput) => void;
  onClose: () => void;
}

export const MemoryDialog: React.FC<MemoryDialogProps> = ({ memory, entities, onSave, onClose }) => {
  const entity = entities.find((e) => e.id === memory?.entity_id);
  const [text, setText] = useState(memory?.text ?? '');
  const [aboutType, setAboutType] = useState(entity?.entity_type ?? YOU);
  const [aboutName, setAboutName] = useState(entity?.name ?? '');
  const [pinned, setPinned] = useState(memory?.pinned ?? false);
  const aboutSomeone = aboutType !== YOU;
  const ready = text.trim() !== '' && (!aboutSomeone || aboutName.trim() !== '');

  const save = () => {
    onSave({
      id: memory?.id ?? null,
      text: text.trim(),
      source: memory?.source ?? 'you',
      about: aboutSomeone ? { name: aboutName.trim(), entity_type: aboutType } : null,
      pinned,
    });
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={memory ? COPY.edit : COPY.add}
      size="md"
      dirty={text !== (memory?.text ?? '')}
      submit={{ label: COPY.save, onPress: save, disabled: !ready }}
    >
      <form className="flex flex-col gap-section" onSubmit={(e) => { e.preventDefault(); if (ready) save(); }}>
        <Section>
          <FieldRow typed autoFocus lines={3} title={COPY.text} value={text} maxLength={KNOWLEDGE_LIMITS.memory} placeholder={COPY.placeholder} onChange={setText} />
        </Section>
        <Section>
          <CardRow
            title={COPY.about}
            actions={
              <div className={LAYOUT.settingsSelect}>
                <Picker label={COPY.about} value={aboutType} onChange={setAboutType} placeholder="" groups={[{ options: [...COPY.aboutOptions] }]} />
              </div>
            }
          />
          {aboutSomeone && (
            <FieldRow typed title={COPY.aboutName} value={aboutName} maxLength={KNOWLEDGE_LIMITS.name} placeholder={COPY.aboutNamePlaceholder} onChange={setAboutName} />
          )}
          <CardRow title={COPY.pin} actions={<Switch checked={pinned} onCheckedChange={setPinned} aria-label={COPY.pin} />} />
        </Section>
      </form>
    </FormDialog>
  );
};
