/** Personalization › Model Tuning: how a downloaded on-device chat model writes and how much it keeps in mind. Simple
 *  choices on the pane; the exact values in the Advanced… sheet (System Settings' push buttons); every setting has an ⓘ. */

import React, { useMemo, useState } from 'react';
import { Cpu } from 'lucide-react';
import { Button, CardRow, ChoiceControl, HelpTip, Input, Section, Slider, Text } from '@shared/ui';
import { ScreenState, FormDialog } from '@shared/components';
import { ModelSelect, SettingsPage } from '@features/settings/components/shared';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { useFormFactor } from '@platform/formFactor';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { modelSources, type ModelChoice } from '@shared/utils/modelResolver';
import { jobChoices } from '@services/ai/models';
import { PERSONALIZATION_CONFIG, type KvBits, type ModelTuning, type TuningPreset } from '@config/personalization.config';
import { UI_CONFIG } from '@config/ui.config';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { knobValue, presetChoice, resolveTuning, withPreset } from '@shared/utils/modelTuning';
import type { LocalModel } from '@services/localModels.service';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';

const TUNING = PERSONALIZATION_CONFIG.modelTuning;
const COPY = TUNING.copy;
const CONTROL = UI_CONFIG.settingControl;

type Knob = (typeof TUNING.knobs)[number];
type Limit = (typeof TUNING.limits)[number];

interface TuningProps {
  saved: ModelTuning;
  onChange: (tuning: ModelTuning) => void;
}

/** A setting's name with its ⓘ. */
const Label: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <span className="flex items-center gap-1">
    {label}
    <HelpTip title={label} label={COPY.help(label)}>{help}</HelpTip>
  </span>
);

/** Decimals a step shows (0.05 → 2). */
const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;

const PresetRow: React.FC<TuningProps & { preset: TuningPreset }> = ({ preset, saved, onChange }) => {
  const { label, help, options } = TUNING.presets[preset];
  const choice = presetChoice(preset, saved);
  return (
    <CardRow
      title={<Label label={label} help={help} />}
      status={choice ? undefined : <Text tone="muted">{COPY.custom}</Text>}
      actions={
        <ChoiceControl<string> items={options} value={choice ?? ''} onValueChange={(next) => onChange(withPreset(preset, next, saved))} label={label} />
      }
    />
  );
};

const KnobRow: React.FC<TuningProps & { knob: Knob; tuning: ModelTuning }> = ({ knob, tuning, saved, onChange }) => {
  const value = knobValue(tuning, knob.key);
  return (
    <CardRow
      title={<Label label={knob.label} help={knob.help} />}
      actions={
        <span className="flex items-center gap-2">
          <Slider
            className={CONTROL.slider}
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={value}
            onChange={(e) => onChange({ ...saved, [knob.key]: Number(e.target.value) })}
            aria-label={knob.label}
          />
          <Text tone="muted" className={CONTROL.value}>{value.toFixed(decimalsOf(knob.step))}</Text>
        </span>
      }
    />
  );
};

/** A token limit: a whole number, or empty for the model's own. */
const LimitRow: React.FC<TuningProps & { limit: Limit; max?: number }> = ({ limit, max, saved, onChange }) => {
  const set = (text: string) => onChange({ ...saved, [limit.key]: text === '' ? undefined : Math.min(max ?? Infinity, Math.max(1, Math.round(Number(text)))) });
  return (
    <CardRow
      title={<Label label={limit.label} help={limit.help} />}
      actions={
        <Input
          size="sm"
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          className={CONTROL.field}
          placeholder={COPY.limitPlaceholder}
          value={saved[limit.key] ?? ''}
          onChange={(e) => set(e.target.value)}
          aria-label={limit.label}
        />
      }
    />
  );
};

const CompressionRow: React.FC<TuningProps> = ({ saved, onChange }) => {
  const { label, help, options } = TUNING.compression;
  const choose = (next: string) => onChange({ ...saved, kvBits: next === 'off' ? undefined : (Number(next) as KvBits) });
  return (
    <CardRow
      title={<Label label={label} help={help} />}
      actions={<ChoiceControl<string> items={options} value={saved.kvBits ? String(saved.kvBits) : 'off'} onValueChange={choose} label={label} />}
    />
  );
};

/** The Advanced… sheet: every exact value, grouped as the simple choices are. */
const AdvancedSheet: React.FC<TuningProps & { model: LocalModel; tuning: ModelTuning; open: boolean; onClose: () => void }> = ({
  model,
  tuning,
  saved,
  onChange,
  open,
  onClose,
}) => {
  const knobs = (group: Knob['group']) =>
    TUNING.knobs.filter((knob) => knob.group === group).map((knob) => (
      <KnobRow key={knob.key} knob={knob} tuning={tuning} saved={saved} onChange={onChange} />
    ));
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={COPY.advancedTitle(model.name)}
      footer={<Button onClick={onClose}>{COPY.done}</Button>}
    >
      <div className="flex flex-col gap-section">
        <Section title={COPY.sampling} footer={COPY.samplingFooter}>{knobs('sampling')}</Section>
        <Section title={COPY.repeats}>{knobs('repeats')}</Section>
        <Section title={COPY.limits} footer={COPY.limitsFooter}>
          {TUNING.limits.map((limit) => (
            <LimitRow key={limit.key} limit={limit} max={model.contextTokens ?? undefined} saved={saved} onChange={onChange} />
          ))}
          <CompressionRow saved={saved} onChange={onChange} />
        </Section>
      </div>
    </FormDialog>
  );
};

/** Restore Defaults and Advanced: push buttons at the pane's end on a Mac or iPad (System Settings), rows on an iPhone. */
const PaneActions: React.FC<{ untouched: boolean; onRestore: () => void; onAdvanced: () => void }> = ({ untouched, onRestore, onAdvanced }) =>
  useFormFactor() === 'phone' ? (
    <Section>
      <CardRow title={COPY.advancedRow} onOpen={onAdvanced} />
      <CardRow title={COPY.restore} tone="accent" onPress={onRestore} disabled={untouched} />
    </Section>
  ) : (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onRestore} disabled={untouched}>{COPY.restore}</Button>
      <Button variant="outline" onClick={onAdvanced}>{COPY.advanced}</Button>
    </div>
  );

/** The downloaded on-device chat models, as Default Models lists them (the one model picker's choices). */
function useTunableModels(localModels: LocalModel[]): ModelChoice[] {
  const { settings, providers } = useSettings();
  const catalogLoaded = useModelCatalog();
  return useMemo(
    () => jobChoices(modelSources(providers, settings, localModels), 'chat').filter((c) => c.provider === LOCAL_MODELS_CONFIG.provider.id && c.ready),
    // `catalogLoaded`: the catalog's arrival re-describes the choices (as in Default Models).
    [providers, settings, localModels, catalogLoaded],
  );
}

/** One model's tuning: the simple choices, then Restore Defaults and the Advanced… sheet. */
const ModelTuning: React.FC<{ choices: ModelChoice[]; localModels: LocalModel[] }> = ({ choices, localModels }) => {
  const { modelTuning, setModelTuning } = usePersonalization();
  const [picked, setPicked] = useState<string>();
  const [advanced, setAdvanced] = useState(false);
  const choice = choices.find((c) => c.value === picked) ?? choices[0];
  const model = localModels.find((m) => m.id === choice?.modelId);
  if (!choice || !model) return null;

  const saved = modelTuning[model.id] ?? {};
  const tuning = resolveTuning(model.id, saved);
  const onChange = (next: ModelTuning) => setModelTuning(model.id, next);
  const rows = { saved, onChange };

  return (
    <>
      <Section footer={COPY.modelFooter}>
        <CardRow
          title={<Label label={COPY.model} help={COPY.modelHelp} />}
          actions={<ModelSelect value={choice.value} choices={choices} onChange={setPicked} />}
        />
      </Section>

      <Section title={COPY.writing} footer={COPY.writingFooter}>
        <PresetRow preset="style" {...rows} />
        <PresetRow preset="repeats" {...rows} />
        <PresetRow preset="length" {...rows} />
      </Section>

      <Section footer={COPY.memoryFooter}>
        <PresetRow preset="memory" {...rows} />
      </Section>

      <PaneActions
        untouched={Object.values(saved).every((value) => value === undefined)}
        onRestore={() => onChange({})}
        onAdvanced={() => setAdvanced(true)}
      />

      <AdvancedSheet model={model} tuning={tuning} open={advanced} onClose={() => setAdvanced(false)} {...rows} />
    </>
  );
};

const NO_MODELS: NonNullable<ReturnType<typeof useLocalModels>['data']> = [];

export const ModelTuningPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const query = useLocalModels();
  const localModels = query.data ?? NO_MODELS;
  const choices = useTunableModels(localModels);
  return (
    <SettingsPage title={COPY.title} onBack={onBack}>
      <ScreenState
        loading={query.isPending}
        error={query.isError ? { cause: query.error, title: COPY.loadFailed } : null}
        empty={choices.length === 0 && { icon: Cpu, message: COPY.noModels, description: COPY.noModelsFooter }}
        className="flex flex-col gap-section"
      >
        <ModelTuning choices={choices} localModels={localModels} />
      </ScreenState>
    </SettingsPage>
  );
};
