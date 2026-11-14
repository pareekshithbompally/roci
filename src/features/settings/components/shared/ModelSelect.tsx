/**
 * ModelSelect — the one model picker in Settings: usable models grouped by
 * provider, then a single "Needs setup" group whose rows say the next step.
 * Every capability (chat, transcription, summaries, knowledge graph) uses it.
 */

import React, { useMemo } from 'react';
import { ModelIcon } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue, Text } from '@shared/ui';
import { groupChoices, type ModelChoice } from '@shared/utils/modelResolver';

interface ModelSelectProps {
  value: string | undefined;
  choices: ModelChoice[];
  onChange: (value: string) => void;
  /** Fixed first entries above the models (e.g. "Same as chat"). */
  leading?: Array<{ value: string; label: string }>;
}

const Item: React.FC<{ choice: ModelChoice }> = ({ choice }) => (
  <SelectItem
    value={choice.value}
    disabled={!choice.ready}
    icon={<ModelIcon provider={choice.provider} modelId={choice.modelId} size={16} />}
    description={choice.hint ?? undefined}
  >
    {choice.label}
  </SelectItem>
);

export const ModelSelect: React.FC<ModelSelectProps> = ({ value, choices, onChange, leading = [] }) => {
  const { groups, needsSetup } = useMemo(() => groupChoices(choices), [choices]);
  const selected = choices.find((c) => c.value === value);
  const selectedLeading = leading.find((l) => l.value === value);

  if (choices.length === 0 && leading.length === 0) {
    return <Text variant="helper" tone="faint">No models yet — add a provider</Text>;
  }

  return (
    <div className="w-64">
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select model">
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <ModelIcon provider={selected.provider} modelId={selected.modelId} size={16} />
              <span className="truncate">{selected.label}</span>
            </span>
          ) : selectedLeading?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {leading.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
        {leading.length > 0 && groups.length > 0 && <SelectSeparator />}
        {groups.map(([provider, items]) => (
          <SelectGroup key={provider}>
            <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
            {items.map((c) => <Item key={c.value} choice={c} />)}
          </SelectGroup>
        ))}
        {needsSetup.length > 0 && (
          <>
            {(groups.length > 0 || leading.length > 0) && <SelectSeparator />}
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
