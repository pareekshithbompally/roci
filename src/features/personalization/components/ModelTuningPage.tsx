/** Personalization › Model Tuning, a macOS settings pane: the chosen on-device chat model's card, then its settings in
 *  inset groups (each row its icon, its ⓘ, and where an untouched value comes from), Restore Defaults, and the
 *  Advanced… sheet of every sampling option by llama.cpp's own name. On a Mac the settings are each model's preset in
 *  the on-device engine, applied by its Restart row. */

import React, { useMemo, useState } from 'react';
import { AlignLeft, Brain, Cpu, Gauge, Palette, Repeat, Shrink, Zap } from 'lucide-react';
import { Button, CardRow, Chip, ChoiceControl, IconTile, Picker, Section, Slider, Switch, Text, type TileGlyph } from '@shared/ui';
import { FormDialog, HelpLabel, ModelIcon, ModelLabel, ScreenState } from '@shared/components';
import { EngineRestartRow, ModelSelect, NumberPicker, SettingsPage } from '@features/settings/components/shared';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { useFormFactor } from '@platform/formFactor';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { LAYOUT } from '@config/layout.config';
import { modelSources, onDeviceChatModel, type ModelChoice } from '@shared/utils/modelResolver';
import { jobChoices, profileOf, shownProfile } from '@services/ai/models';
import { PERSONALIZATION_CONFIG, type KvType, type ModelTuning, type TuningPreset, type TuningSource } from '@config/personalization.config';
import { UI_CONFIG } from '@config/ui.config';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { formatFileSize } from '@shared/utils/formatters';
import {
  contextChoices,
  optionValue,
  ownTuning,
  presetChoice,
  presetKeys,
  resolveTuning,
  sourceOf,
  withKvType,
  withoutKeys,
  withPreset,
} from '@shared/utils/modelTuning';
import type { LocalModel } from '@services/localModels.service';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';
import { useModelMemory } from '@features/personalization/hooks/useModelMemory';
import { platform } from '@platform/index';

const TUNING = PERSONALIZATION_CONFIG.modelTuning;
const COPY = TUNING.copy;
const CONTROL = UI_CONFIG.settingControl;
const ON_DEVICE = LOCAL_MODELS_CONFIG.provider.id;

type Option = (typeof TUNING.options)[number];

interface TuningProps {
  model: LocalModel;
  saved: ModelTuning;
  resolved: ModelTuning;
  onChange: (tuning: ModelTuning) => void;
}

/** Decimals a step shows (0.05 → 2). */
const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;

/** An option's value as the model runs it, as its slider shows it. */
const shown = (option: Option, tuning: ModelTuning) => optionValue(tuning, option.key).toFixed(decimalsOf(option.step));

/** A row's line: where an untouched value comes from, then what it is set to. */
function rowLine(source: TuningSource | undefined, detail?: string): string | undefined {
  return [source && TUNING.sources[source], detail].filter(Boolean).join(' · ') || undefined;
}

/** The exact values behind a preset, by their names: "Temperature 1.00 · Top P 0.95". */
function presetValues(preset: TuningPreset, tuning: ModelTuning): string {
  const keys: readonly string[] = presetKeys(preset);
  return TUNING.options.filter((o) => keys.includes(o.key)).map((o) => `${o.label} ${shown(o, tuning)}`).join(' · ');
}

/** A setting row: its icon, its name with its ⓘ, its line, and its control. */
const SettingRow: React.FC<{ icon: TileGlyph; label: string; help: string; line?: string; status?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  label,
  help,
  line,
  status,
  children,
}) => <CardRow leading={<IconTile icon={icon} />} title={<HelpLabel label={label} help={help} />} description={line} status={status} actions={children} />;

const PresetRow: React.FC<TuningProps & { preset: TuningPreset; icon: TileGlyph }> = ({ preset, icon, model, saved, resolved, onChange }) => {
  const { label, help, options } = TUNING.presets[preset];
  const choice = presetChoice(preset, saved, resolved);
  const line = rowLine(sourceOf(model.id, presetKeys(preset), saved), presetValues(preset, resolved));
  return (
    <SettingRow icon={icon} label={label} help={help} line={line} status={choice ? undefined : <Text tone="muted">{COPY.custom}</Text>}>
      <ChoiceControl<string> items={options} value={choice ?? ''} onValueChange={(next) => onChange(withPreset(preset, next, saved))} label={label} />
    </SettingRow>
  );
};

/** A token limit chosen from fixed lengths: the longest reply, or the thinking budget. */
const LimitRow: React.FC<TuningProps & { limit: 'n-predict' | 'reasoning-budget'; icon: TileGlyph }> = ({ limit, icon, model, saved, resolved, onChange }) => {
  const { label, help, options } = limit === 'n-predict' ? TUNING.replyLength : TUNING.thinking;
  return (
    <SettingRow icon={icon} label={label} help={help} line={rowLine(sourceOf(model.id, [limit], saved))}>
      <NumberPicker label={label} value={resolved[limit]} options={options.map((o) => ({ value: o.tokens, label: o.label }))}
        placeholder={COPY.custom} onChange={(tokens) => onChange({ ...saved, [limit]: tokens })} />
    </SettingRow>
  );
};

/** How much the model keeps in mind: the sizes it can hold from the least Roci's chat needs, each with llama.cpp's memory
 *  estimate at the KV cache type in use. */
const ContextRow: React.FC<TuningProps> = ({ model, saved, resolved, onChange }) => {
  const { label, help, tokensPerK, choice } = TUNING.context;
  const sizes = contextChoices(model.contextTokens);
  const kvType = resolved['cache-type-k'] ?? 'f16';
  const memory = useModelMemory(model.id, sizes.map((tokens) => ({ tokens, kvType })));
  const options = sizes.map((tokens, i) => ({ value: tokens, label: choice(tokens / tokensPerK, memory[i] && formatFileSize(memory[i])) }));
  return (
    <SettingRow icon={Gauge} label={label} help={help} line={rowLine(sourceOf(model.id, ['ctx-size'], saved))}>
      <NumberPicker label={label} value={resolved['ctx-size']} options={options} placeholder={COPY.custom}
        onChange={(tokens) => onChange({ ...saved, 'ctx-size': tokens })} />
    </SettingRow>
  );
};

/** The KV cache's type (Mac): Off, Half, Quarter, each with what it saves at the context size in use. */
const MemorySaverRow: React.FC<TuningProps> = ({ model, saved, resolved, onChange }) => {
  const { label, help, options, saves } = TUNING.memorySaver;
  const tokens = resolved['ctx-size'] ?? TUNING.context.minTokens;
  const memory = useModelMemory(model.id, options.map((o) => ({ tokens, kvType: o.value })));
  const items = options.map((o, i) => {
    const saving = memory[0] !== undefined && memory[i] !== undefined ? memory[0] - memory[i] : 0;
    return { value: o.value, label: saving > 0 ? saves(o.label, formatFileSize(saving)) : o.label };
  });
  return (
    <SettingRow icon={Shrink} label={label} help={help} line={rowLine(sourceOf(model.id, ['cache-type-k'], saved))}>
      <div className={LAYOUT.capabilityPicker}>
        <Picker label={label} value={resolved['cache-type-k'] ?? 'f16'} onChange={(next) => onChange(withKvType(saved, next as KvType))} placeholder="" groups={[{ options: items }]} />
      </div>
    </SettingRow>
  );
};

/** The model's own draft (Mac, a model that ships one): on unless turned off. */
const SpeedUpRow: React.FC<TuningProps> = ({ saved, resolved, onChange }) => {
  const { label, help } = TUNING.speedUp;
  const set = (on: boolean) => onChange(on ? withoutKeys(saved, ['spec-type']) : { ...saved, 'spec-type': 'none' });
  return (
    <SettingRow icon={Zap} label={label} help={help} line={rowLine(saved['spec-type'] === undefined ? 'roci' : undefined)}>
      <Switch checked={resolved['spec-type'] !== 'none'} onCheckedChange={set} aria-label={label} />
    </SettingRow>
  );
};

/** One sampling option in the Advanced… sheet: its name and ⓘ, its slider. */
const OptionRow: React.FC<TuningProps & { option: Option }> = ({ option, saved, resolved, onChange }) => (
  <CardRow
    title={<HelpLabel label={option.label} help={option.help} />}
    actions={
      <span className="flex items-center gap-2">
        <Slider
          className={CONTROL.slider}
          min={option.min}
          max={option.max}
          step={option.step}
          value={optionValue(resolved, option.key)}
          onChange={(e) => onChange({ ...saved, [option.key]: Number(e.target.value) })}
          aria-label={option.label}
        />
        <Text tone="muted" className={CONTROL.value}>{shown(option, resolved)}</Text>
      </span>
    }
  />
);

/** The Advanced… sheet: every sampling option Roci tunes, grouped as the simple choices are. */
const AdvancedSheet: React.FC<TuningProps & { open: boolean; onClose: () => void }> = ({ open, onClose, ...rows }) => {
  const group = (name: Option['group']) => TUNING.options.filter((o) => o.group === name).map((o) => <OptionRow key={o.key} option={o} {...rows} />);
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={COPY.advancedTitle(rows.model.name)}
      submit={{ label: COPY.done, onPress: onClose }}
      viewOnly
    >
      <div className="flex flex-col gap-section">
        <Section title={COPY.sampling} footer={COPY.samplingFooter}>{group('sampling')}</Section>
        <Section title={COPY.repeats} footer={COPY.repeatsFooter}>{group('repeats')}</Section>
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

/** The chosen model's card: its maker's icon, its name and what it takes, its facts (size, quantization, context,
 *  speed-up), and the picker of the downloaded chat models. */
const ModelCard: React.FC<{ model: LocalModel; choice: ModelChoice; choices: ModelChoice[]; onPick: (value: string) => void }> = ({ model, choice, choices, onPick }) => {
  const profile = shownProfile(profileOf(ON_DEVICE, onDeviceChatModel(model)));
  const facts = [formatFileSize(model.bytes), model.quant, model.contextTokens && COPY.contextChip(model.contextTokens / TUNING.context.tokensPerK)];
  return (
    <Section title={COPY.model} footer={COPY.modelFooter}>
      <CardRow
        leading={<ModelIcon provider={ON_DEVICE} modelId={model.id} />}
        title={<ModelLabel name={model.name} profile={profile} />}
        description={
          <span className="flex min-w-0 items-center gap-1">
            {facts.map((fact) => fact && <Chip key={fact} label={fact} />)}
            {model.drafts && platform.servesOnDeviceModels && <Chip icon={Zap} label={COPY.speedUpChip} />}
          </span>
        }
        actions={choices.length > 1 ? <ModelSelect value={choice.value} choices={choices} onChange={onPick} /> : undefined}
      />
    </Section>
  );
};

/** The downloaded on-device chat models, as Default Models lists them (the one model picker's choices). */
function useTunableModels(localModels: LocalModel[]): ModelChoice[] {
  const { settings, providers } = useSettings();
  const catalogLoaded = useModelCatalog();
  return useMemo(
    () => jobChoices(modelSources(providers, settings, localModels), 'chat', (r) => r.id).filter((c) => c.provider === ON_DEVICE && c.ready),
    // `catalogLoaded`: the catalog's arrival re-describes the choices (as in Default Models).
    [providers, settings, localModels, catalogLoaded],
  );
}

/** One model's settings: how it writes, its memory and speed, then Restore Defaults and the Advanced… sheet. */
const ModelTuning: React.FC<{ choices: ModelChoice[]; localModels: LocalModel[] }> = ({ choices, localModels }) => {
  const { modelTuning, setModelTuning } = usePersonalization();
  const [picked, setPicked] = useState<string>();
  const [advanced, setAdvanced] = useState(false);
  const choice = choices.find((c) => c.value === picked) ?? choices[0];
  const model = localModels.find((m) => m.id === choice?.modelId);
  if (!choice || !model) return null;

  const saved = modelTuning[model.id] ?? {};
  const rows: TuningProps = { model, saved, resolved: resolveTuning(model.id, saved), onChange: (next) => setModelTuning(model.id, next) };
  const thinks = shownProfile(profileOf(ON_DEVICE, onDeviceChatModel(model))).reasoning;
  const mac = platform.servesOnDeviceModels;

  return (
    <>
      <ModelCard model={model} choice={choice} choices={choices} onPick={setPicked} />

      <Section title={COPY.writing}>
        <PresetRow preset="style" icon={Palette} {...rows} />
        <PresetRow preset="repeats" icon={Repeat} {...rows} />
        <LimitRow limit="n-predict" icon={AlignLeft} {...rows} />
        {thinks && <LimitRow limit="reasoning-budget" icon={Brain} {...rows} />}
      </Section>

      <Section title={COPY.memory} footer={COPY.memoryFooter}>
        <ContextRow {...rows} />
        {mac && <MemorySaverRow {...rows} />}
        {mac && model.drafts && <SpeedUpRow {...rows} />}
        {mac && <EngineRestartRow />}
      </Section>

      <PaneActions untouched={Object.keys(ownTuning(saved)).length === 0} onRestore={() => rows.onChange({})} onAdvanced={() => setAdvanced(true)} />

      <AdvancedSheet open={advanced} onClose={() => setAdvanced(false)} {...rows} />
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
