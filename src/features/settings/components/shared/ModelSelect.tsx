/** The one Settings model picker (the system pop-up menu): usable models by provider, then "Needs setup" models that run their step. */

import React, { useMemo } from 'react';
import { ModelIcon } from '@shared/components';
import { LAYOUT } from '@config/layout.config';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Picker, Text, type PickerGroup, type PickerOption } from '@shared/ui';
import { groupChoices, type ChoiceSetup, type ModelChoice } from '@shared/utils/modelResolver';

interface ModelSelectProps {
  value: string | undefined;
  choices: ModelChoice[];
  onChange: (value: string) => void;
  /** A first row that turns the job off (its value is stored like a model's). */
  off?: { value: string; label: string };
}

/** A step still needed, as a macOS menu says it: the action and the model ("Download Whisper Small (270 MB)"), or its status. */
function setupLabel(name: string, setup: ChoiceSetup, hint: string | null): string {
  if (setup.busy) return `${name} — ${setup.percent !== null ? `Downloading ${setup.percent}%` : 'Downloading…'}`;
  if (setup.kind === 'allow') return `Allow ${name}…`;
  return hint ? `Download ${name} (${hint})` : `Download ${name}`;
}

/** A menu row: the name with its marks in parentheses; a step it needs as an action; why it can't run after a dash. */
export function rowLabel(choice: ModelChoice): string {
  if (!choice.ready && choice.setup) return setupLabel(choice.label, choice.setup, choice.hint);
  const marks = (choice.marks ?? []).map((m) => m.label);
  const name = marks.length > 0 ? `${choice.label} (${marks.join(', ')})` : choice.label;
  return !choice.ready && choice.hint ? `${name} — ${choice.hint}` : name;
}

function option(choice: ModelChoice): PickerOption {
  return {
    value: choice.value,
    label: rowLabel(choice),
    title: choice.label,
    disabled: !choice.ready && !choice.setup,
  };
}

/** The value while nothing is chosen (or nothing can be), as System Settings shows it. */
const NONE = 'None';

export const ModelSelect: React.FC<ModelSelectProps> = ({ value, choices, onChange, off }) => {
  const groups = useMemo<PickerGroup[]>(() => {
    const { groups: byProvider, needsSetup } = groupChoices(choices);
    return [
      ...(off ? [{ options: [{ value: off.value, label: off.label }] }] : []),
      ...byProvider.map(([provider, items]) => ({ label: getProviderTitle(provider), options: items.map(option) })),
      ...(needsSetup.length ? [{ label: 'Needs setup', options: needsSetup.map(option) }] : []),
    ];
  }, [choices, off]);
  const selected = choices.find((c) => c.value === value);

  /** A model that needs setup runs its step; the selection stays until it's ready. */
  const choose = (next: string) => {
    const choice = choices.find((c) => c.value === next);
    if (choice && !choice.ready && choice.setup) {
      if (!choice.setup.busy) choice.setup.run();
      return;
    }
    onChange(next);
  };

  if (choices.length === 0) {
    return <Text tone="faint">{NONE}</Text>;
  }

  return (
    <div className={LAYOUT.capabilityPicker}>
      <Picker
        label="Model"
        value={value}
        groups={groups}
        onChange={choose}
        placeholder={NONE}
        leading={selected && <ModelIcon provider={selected.provider} modelId={selected.modelId} size={16} />}
      />
    </div>
  );
};
