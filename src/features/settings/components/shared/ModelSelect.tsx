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

/** The step a model still needs, as menu text (a native menu shows text only). */
function setupText(setup: ChoiceSetup): string {
  if (setup.busy) return setup.percent !== null ? `${setup.percent}%` : 'Downloading…';
  return setup.kind === 'allow' ? 'Allow' : 'Download';
}

/** One menu entry: the name, then its size or note, its marks and the step it needs, after a middle dot. */
function option(choice: ModelChoice): PickerOption {
  const setup = !choice.ready && choice.setup;
  const notes = [choice.hint, ...(choice.marks ?? []).map((m) => m.label), setup ? setupText(setup) : null].filter(Boolean);
  return {
    value: choice.value,
    label: [choice.label, ...notes].join(' · '),
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
