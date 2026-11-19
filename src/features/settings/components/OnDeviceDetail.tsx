/** Providers › On this device: the models built into the system, then the ones Roci downloads, by what they do. */

import React from 'react';
import { AppleIntelligenceIntegration } from '@features/integrations';
import { JOB_GLYPH, ModelDownloadButton, ModelIcon, ModelLabel, ModelSize, ProvidersAvatar } from '@shared/components';
import { Card, CardRow, ICON_TILE_PX, IconTile, Picker, Section, Status } from '@shared/ui';
import { useSettings } from '@shared/contexts/SettingsContext';
import { LAYOUT } from '@config/layout.config';
import { formatFileSize } from '@shared/utils/formatters';
import { isIntegrationAvailable } from '@shared/utils/integrations';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import type { LocalModel, LocalModelKind } from '@services/localModels.service';
import { useLocalModelControls } from '@features/settings/hooks/useLocalModels';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { onDeviceChatModel } from '@shared/utils/modelResolver';
import { profileOf, shownProfile } from '@services/ai/models';
import { platform } from '@platform/index';

const { provider: ON_DEVICE, kindLabels: KIND_LABELS, page: COPY, idle: IDLE } = LOCAL_MODELS_CONFIG;

/** Download groups in display order. */
const KINDS: readonly LocalModelKind[] = ['chat', 'speech', 'voice', 'embedding'];

/** A downloaded chat model's profile (what it can take and do); nothing for other kinds, or before its files are here. */
const profileOfRow = (model: LocalModel) =>
  model.kind === 'chat' && model.installed ? shownProfile(profileOf(ON_DEVICE.id, onDeviceChatModel(model))) : null;

/** A downloadable model: its maker's icon, name and chips, then its size and Download / progress / Delete in fixed columns. */
const DownloadRow: React.FC<{ model: LocalModel; control: OnDeviceModel }> = ({ model, control }) => (
  <CardRow
    leading={<ModelIcon provider={ON_DEVICE.id} modelId={model.id} size={ICON_TILE_PX} />}
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
          status={<Status tone="success">{READ_ALOUD_CONFIG.system.hint}</Status>}
        />
      </Section>
    )}
  </Section>
);

/** How long unused models stay loaded, for every engine on this device. */
const Memory: React.FC = () => {
  const { settings, setSettings } = useSettings();
  const minutes = settings.modelIdleMinutes ?? IDLE.defaultMinutes;
  return (
    <Section title={COPY.memory} footer={IDLE.footer}>
      <CardRow
        title={IDLE.title}
        actions={
          <div className={LAYOUT.capabilityPicker}>
            <Picker
              label={IDLE.title}
              value={String(minutes)}
              onChange={(value) => setSettings({ modelIdleMinutes: Number(value) })}
              placeholder=""
              groups={[{ options: IDLE.options.map((o) => ({ value: String(o.minutes), label: o.label })) }]}
            />
          </div>
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
    <Card>
      <CardRow leading={<ProvidersAvatar provider={ON_DEVICE.id} size={20} />} title={ON_DEVICE.title} />
    </Card>
    <BuiltIn />
    {platform.hasLocalModels && <Downloads />}
    {platform.hasLocalModels && <Memory />}
  </>
);
