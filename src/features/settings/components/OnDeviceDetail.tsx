/** Providers › On this device: the models built into the system, then the ones Roci downloads, by what they do. */

import React from 'react';
import { AppleIntelligenceIntegration } from '@features/integrations';
import { JOB_GLYPH, ModelDownloadButton, ModelIcon, ModelLabel, ModelSize } from '@shared/components';
import { History, Layers, MemoryStick, Timer } from 'lucide-react';
import { Button, CardRow, IconTile, Section, Status, type TileGlyph } from '@shared/ui';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { dialogService } from '@services/tauri';
import { formatFileSize } from '@shared/utils/formatters';
import { isIntegrationAvailable } from '@shared/utils/integrations';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import type { LocalModel, LocalModelKind } from '@services/localModels.service';
import { engineSettingsOf, useApplyModelDirectory, useLocalModelControls } from '@features/settings/hooks/useLocalModels';
import { EngineRestartRow, NumberPicker, type NumberChoice } from '@features/settings/components/shared';
import type { OnDeviceEngineSettings } from '@shared/types';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { onDeviceChatModel } from '@shared/utils/modelResolver';
import { profileOf, shownProfile } from '@services/ai/models';
import { platform } from '@platform/index';

const { provider: ON_DEVICE, kindLabels: KIND_LABELS, page: COPY, idle: IDLE, directory: DIRECTORY, engine: ENGINE } = LOCAL_MODELS_CONFIG;

/** Download groups in display order. */
const KINDS: readonly LocalModelKind[] = ['chat', 'speech', 'voice', 'embedding'];

/** A downloaded chat model's profile (what it can take and do); nothing for other kinds, or before its files are here. */
const profileOfRow = (model: LocalModel) =>
  model.kind === 'chat' && model.installed ? shownProfile(profileOf(ON_DEVICE.id, onDeviceChatModel(model))) : null;

/** A downloadable model: its maker's icon, name and chips, then its size and Download / progress / Delete in fixed columns. */
const DownloadRow: React.FC<{ model: LocalModel; control: OnDeviceModel }> = ({ model, control }) => (
  <CardRow
    leading={<ModelIcon provider={ON_DEVICE.id} modelId={model.id} />}
    title={<ModelLabel name={model.name} profile={profileOfRow(model)} />}
    actions={
      <>
        <ModelSize size={formatFileSize(model.bytes)} />
        <ModelDownloadButton model={control} removable />
      </>
    }
  />
);

/** What the system ships: Apple Intelligence (with Apple Speech) where the device has it, and the system voices. */
const BuiltIn: React.FC = () => (
  <Section title={COPY.builtIn} layout="stack">
    {isIntegrationAvailable('appleIntelligence') && <AppleIntelligenceIntegration />}
    {platform.hasLocalModels && (
      <Section footer={COPY.systemVoices}>
        <CardRow
          leading={<IconTile icon={JOB_GLYPH.readAloud} />}
          title={READ_ALOUD_CONFIG.system.label}
          status={<Status state="ready">{READ_ALOUD_CONFIG.system.hint}</Status>}
        />
      </Section>
    )}
  </Section>
);

/** A memory setting: its icon, its name, and a pop-up of its choices (numbers, as Settings stores them). */
const MemoryRow: React.FC<{ icon: TileGlyph; title: string; value: number; options: NumberChoice[]; onChange: (value: number) => void }> = ({
  icon,
  title,
  value,
  options,
  onChange,
}) => (
  <CardRow leading={<IconTile icon={icon} />} title={title} actions={<NumberPicker label={title} value={value} options={options} onChange={onChange} />} />
);

/** The Mac's engine (llama.cpp's server): memory it keeps free, each model's prompt cache, models at once, and the
 *  restart that applies them. */
const EngineRows: React.FC = () => {
  const { settings, setSettings } = useSettings();
  const engine = engineSettingsOf(settings);
  const set = (change: OnDeviceEngineSettings) => setSettings({ onDeviceEngine: { ...settings.onDeviceEngine, ...change } });
  return (
    <>
      <MemoryRow icon={MemoryStick} title={ENGINE.memoryMargin.title} value={engine.memoryMarginMib}
        options={ENGINE.memoryMargin.options.map((o) => ({ value: o.mib, label: o.label }))} onChange={(mib) => set({ memoryMarginMib: mib })} />
      <MemoryRow icon={History} title={ENGINE.cacheRam.title} value={engine.cacheRamMib}
        options={ENGINE.cacheRam.options.map((o) => ({ value: o.mib, label: o.label }))} onChange={(mib) => set({ cacheRamMib: mib })} />
      <MemoryRow icon={Layers} title={ENGINE.modelsMax.title} value={engine.modelsMax}
        options={ENGINE.modelsMax.options.map((o) => ({ value: o.count, label: o.label }))} onChange={(count) => set({ modelsMax: count })} />
      <EngineRestartRow />
    </>
  );
};

/** How long unused models stay loaded, for every engine on this device; on a Mac, the engine's memory settings too. */
const Memory: React.FC = () => {
  const { settings, setSettings } = useSettings();
  const minutes = settings.modelIdleMinutes ?? IDLE.defaultMinutes;
  return (
    <Section title={COPY.memory} footer={platform.servesOnDeviceModels ? `${IDLE.footer} ${ENGINE.footer}` : IDLE.footer}>
      <MemoryRow icon={Timer} title={IDLE.title} value={minutes}
        options={IDLE.options.map((o) => ({ value: o.minutes, label: o.label }))} onChange={(next) => setSettings({ modelIdleMinutes: next })} />
      {platform.servesOnDeviceModels && <EngineRows />}
    </Section>
  );
};

/** Where downloaded models are stored (Mac): Roci's folder, or one the user picks; a folder Roci can't use is refused. */
const ModelDirectory: React.FC = () => {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const applyDirectory = useApplyModelDirectory();
  const dir = settings.modelDirectory;
  const apply = async (next: string | undefined) => {
    try {
      await applyDirectory(next);
    } catch (error: unknown) {
      console.error('[ModelDirectory] refused:', error);
      showToast(DIRECTORY.refused, 'error');
    }
  };
  const choose = async () => {
    const picked = await dialogService.open({ directory: true, title: DIRECTORY.pickerTitle, defaultPath: dir });
    if (typeof picked === 'string') await apply(picked);
  };
  return (
    <Section footer={DIRECTORY.footer}>
      <CardRow
        title={DIRECTORY.title}
        description={dir ?? DIRECTORY.rociFolder}
        actions={
          <>
            {dir && <Button variant="outline" onClick={() => void apply(undefined)}>{DIRECTORY.reset}</Button>}
            <Button variant="outline" onClick={() => void choose()}>{DIRECTORY.choose}</Button>
          </>
        }
      />
    </Section>
  );
};

/** Every model Roci can download to this device, one section per job. */
const Downloads: React.FC = () => {
  const { data: models = [] } = useLocalModels();
  const controls = useLocalModelControls();
  return (
    <>
      {KINDS.map((kind) => {
        const ofKind = models.filter((m) => m.kind === kind && controls[m.id]);
        if (ofKind.length === 0) return null;
        return (
          <Section key={kind} title={KIND_LABELS[kind]}>
            {ofKind.map((m) => <DownloadRow key={m.id} model={m} control={controls[m.id]} />)}
          </Section>
        );
      })}
    </>
  );
};

export const OnDeviceDetail: React.FC = () => (
  <>
    <BuiltIn />
    {platform.hasLocalModels && <Downloads />}
    {platform.canChooseModelDirectory && <ModelDirectory />}
    {platform.hasLocalModels && <Memory />}
  </>
);
