/** Composer thinking control: the current chat's level (Default, Off, Low…Max), shown when the chat model thinks. */

import React, { useMemo } from 'react';
import { Lightbulb, LightbulbOff } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { capabilitiesOf } from '@services/ai/capabilities';
import { CHAT_REASONING_COPY, REASONING_EFFORT_LEVELS } from '@config/chat.config';
import { UI_CONFIG } from '@config/ui.config';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
} from '@shared/ui';
import { useChatReasoningEffort, useChatStore } from '@features/chat/stores';
import type { ReasoningEffort } from '@shared/types';

const labelOf = (effort: ReasoningEffort) => REASONING_EFFORT_LEVELS.find((level) => level.value === effort)?.label ?? effort;

/** The current chat's thinking level and its setter; null when the chat model doesn't think. */
export function useReasoningControl(): { effort: ReasoningEffort; setEffort: (effort: ReasoningEffort) => void } | null {
  const { settings, providers } = useSettings();
  useModelCatalog();
  const resolved = useMemo(() => resolveChatModel(settings, providers), [settings, providers]);
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="toolbar" title={CHAT_REASONING_COPY.control} aria-label={`${CHAT_REASONING_COPY.control}: ${labelOf(effort)}`}>
          <Icon icon={off ? LightbulbOff : Lightbulb} size="xs" tone={off ? 'faint' : undefined} />
          {effort !== 'provider-default' && labelOf(effort)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={UI_CONFIG.picker.sideOffset}>
        <DropdownMenuLabel>{CHAT_REASONING_COPY.control}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={effort} onValueChange={(value) => setReasoningEffort(value as ReasoningEffort)}>
          {REASONING_EFFORT_LEVELS.map((level) => (
            <DropdownMenuRadioItem key={level.value} value={level.value}>{level.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
