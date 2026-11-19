/** Composer thinking control: the current chat's level (Default, Off, Low…Max), shown when the chat model thinks. */

import React from 'react';
import { Lightbulb, LightbulbOff } from 'lucide-react';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { useChatModel } from '@features/chat/hooks/useChatModel';
import { capabilitiesOf } from '@services/ai/capabilities';
import { CHAT_REASONING_COPY, REASONING_EFFORT_LEVELS } from '@config/chat.config';
import { Button, Icon } from '@shared/ui';
import { Menu } from '@shared/components';
import { useChatReasoningEffort, useChatStore } from '@features/chat/stores';
import type { ReasoningEffort } from '@shared/types';

const labelOf = (effort: ReasoningEffort) => REASONING_EFFORT_LEVELS.find((level) => level.value === effort)?.label ?? effort;

/** The current chat's thinking level and its setter; null when the chat model doesn't think. */
export function useReasoningControl(): { effort: ReasoningEffort; setEffort: (effort: ReasoningEffort) => void } | null {
  useModelCatalog();
  const resolved = useChatModel();
  const effort = useChatReasoningEffort();
  const setEffort = useChatStore((s) => s.setReasoningEffort);
  // Derived each render: useModelCatalog re-renders this when the models.dev cache arrives.
  if (!resolved || !capabilitiesOf(resolved.provider, resolved.model).reasoning) return null;
  return { effort, setEffort };
}

export const ReasoningPicker: React.FC = () => {
  const control = useReasoningControl();
  if (!control) return null;
  const { effort, setEffort: setReasoningEffort } = control;
  const off = effort === 'none';

  return (
    <Menu
      label={CHAT_REASONING_COPY.control}
      align="start"
      trigger={(
        <Button variant="ghost" size="toolbar" title={CHAT_REASONING_COPY.control} aria-label={`${CHAT_REASONING_COPY.control}: ${labelOf(effort)}`}>
          <Icon icon={off ? LightbulbOff : Lightbulb} size="xs" tone={off ? 'faint' : undefined} />
          {effort !== 'provider-default' && labelOf(effort)}
        </Button>
      )}
      items={[
        { type: 'label', label: CHAT_REASONING_COPY.control },
        ...REASONING_EFFORT_LEVELS.map((level) => ({ type: 'check' as const, label: level.label, checked: level.value === effort, onSelect: () => setReasoningEffort(level.value) })),
      ]}
    />
  );
};
