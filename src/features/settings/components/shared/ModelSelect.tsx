/** The one Settings model picker: usable models by provider, then "Needs setup" rows that run their step. */

import React, { useMemo } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { ModelIcon } from '@shared/components';
import { CapabilityMark } from '@features/settings/components/ModalityIcons';
import { LAYOUT } from '@config/layout.config';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Icon, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue, Text } from '@shared/ui';
import { groupChoices, type ChoiceSetup, type ModelChoice } from '@shared/utils/modelResolver';

interface ModelSelectProps {
  value: string | undefined;
  choices: ModelChoice[];
  onChange: (value: string) => void;
  /** A first row that turns the job off (its value is stored like a model's). */
  off?: { value: string; label: string };
}

/** The step a row needs: Download / Allow, or progress while it runs. */
const SetupMark: React.FC<{ setup: ChoiceSetup }> = ({ setup }) => {
  if (setup.busy) {
    return (
      <span className="inline-flex items-center gap-1">
        <Icon icon={Loader2} size="xs" tone="muted" className="animate-spin" />
        {setup.percent !== null && <Text variant="helper" tone="muted" className="tabular-nums">{setup.percent}%</Text>}
      </span>
    );
  }
  if (setup.kind === 'allow') return <Text variant="helper" tone="accent">Allow</Text>;
  return <Icon icon={Download} size="xs" tone="accent" label="Download" />;
};

/** A row's end: its capability marks, then its setup step while it isn't ready. */
const RowEnd: React.FC<{ choice: ModelChoice }> = ({ choice }) => {
  const setup = !choice.ready && choice.setup;
  if (!choice.marks?.length && !setup) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {choice.marks?.map((mark) => <CapabilityMark key={mark.label} icon={mark.icon} label={mark.label} />)}
      {setup && <SetupMark setup={setup} />}
    </span>
  );
};

const Item: React.FC<{ choice: ModelChoice }> = ({ choice }) => (
  <SelectItem
    value={choice.value}
    disabled={!choice.ready && !choice.setup}
    icon={<ModelIcon provider={choice.provider} modelId={choice.modelId} size={16} />}
    description={choice.hint ?? undefined}
    trailing={<RowEnd choice={choice} />}
  >
    {choice.label}
  </SelectItem>
);

/** The value while nothing is chosen (or nothing can be), as System Settings shows it. */
const NONE = 'None';

export const ModelSelect: React.FC<ModelSelectProps> = ({ value, choices, onChange, off }) => {
  const { groups, needsSetup } = useMemo(() => groupChoices(choices), [choices]);
  const selected = choices.find((c) => c.value === value);

  /** A row that needs setup runs its step; the selection stays until it's ready. */
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
    <Select value={value} onValueChange={choose}>
      <SelectTrigger>
        <SelectValue placeholder={NONE}>
          {off && value === off.value && <span className="truncate">{off.label}</span>}
          {selected && (
            <span className="flex items-center gap-2 truncate">
              <ModelIcon provider={selected.provider} modelId={selected.modelId} size={16} />
              <span className="truncate">{selected.label}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {off && (
          <>
            <SelectItem value={off.value}>{off.label}</SelectItem>
            <SelectSeparator />
          </>
        )}
        {groups.map(([provider, items]) => (
          <SelectGroup key={provider}>
            <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
            {items.map((c) => <Item key={c.value} choice={c} />)}
          </SelectGroup>
        ))}
        {needsSetup.length > 0 && (
          <>
            {groups.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>Needs setup</SelectLabel>
              {needsSetup.map((c) => <Item key={c.value} choice={c} />)}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
    </div>
  );
};
