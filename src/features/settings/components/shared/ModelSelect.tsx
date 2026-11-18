/** The one Settings model picker: the shared model menu (native on a Mac, the system's text menu elsewhere); a model that needs setup runs its step. */

import React, { useMemo } from 'react';
import { ModelIcon, modelRowText, openModelMenu } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { LAYOUT } from '@config/layout.config';
import { MODEL_MENU_COPY } from '@config/modelMenu.config';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Picker, Text, type PickerGroup, type PickerOption } from '@shared/ui';
import { groupChoices, type ModelChoice } from '@shared/utils/modelResolver';
import { platform } from '@platform/index';

interface ModelSelectProps {
  value: string | undefined;
  choices: ModelChoice[];
  onChange: (value: string) => void;
  /** A first row that turns the job off (its value is stored like a model's). */
  off?: { value: string; label: string };
}

function option(choice: ModelChoice): PickerOption {
  return { value: choice.value, label: modelRowText(choice), title: choice.label, disabled: !choice.ready && !choice.setup };
}

/** The value while nothing is chosen (or nothing can be), as System Settings shows it. */
const NONE = 'None';

export const ModelSelect: React.FC<ModelSelectProps> = ({ value, choices, onChange, off }) => {
  const { settings } = useSettings();
  const groups = useMemo<PickerGroup[]>(() => {
    const { groups: byProvider, needsSetup } = groupChoices(choices);
    return [
      ...(off ? [{ options: [{ value: off.value, label: off.label }] }] : []),
      ...byProvider.map(([provider, items]) => ({ label: getProviderTitle(provider), options: items.map(option) })),
      ...(needsSetup.length ? [{ label: MODEL_MENU_COPY.needsSetup, options: needsSetup.map(option) }] : []),
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

  // Mac: the native model menu (icons, grey facts line); elsewhere the system's own text menu.
  const openNative = (anchor: DOMRect) => {
    openModelMenu(choices, { selected: value, off, showAvatars: !!settings.showModelAvatars }, anchor)
      .then((chosen) => chosen && choose(chosen))
      .catch((error: unknown) => console.error('[ModelSelect] menu failed:', error));
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
        onOpen={platform.hasMenuBar ? openNative : undefined}
        placeholder={NONE}
        leading={selected && <ModelIcon provider={selected.provider} modelId={selected.modelId} size={16} />}
      />
    </div>
  );
};
