/** Every model choice by job; sources are providers, enabled integrations and local models. Sets the defaults. */

import React, { useMemo } from 'react';
import { AudioLines, MessageSquare, NotebookText, ScanSearch, Volume2, Waypoints, type LucideIcon } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useOnDeviceModel } from '@shared/hooks/useOnDeviceModel';
import { ModelDownloadButton, ModelReadyStatus } from '@shared/components';
import { formatFileSize } from '@shared/utils/formatters';
import { modelChoices, withSummaryModels, type ModelChoice } from '@shared/utils/modelResolver';
import { speechSelectionKey, speechSelectionOf } from '@services/ai/transcription';
import { CAPABILITIES_CONFIG } from '@config/capabilities.config';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';
import { downloadSetup, useLocalModelControls, useLocalModels, type LocalModelControl } from '@features/settings/hooks/useLocalModels';
import { useAppleSpeechSetup } from '@features/integrations';
import { CardRow, Icon, Section } from '@shared/ui';
import type { LocalModel } from '@services/localModels.service';
import { LIVE_TRANSCRIPTION_MARK, ModelSelect, SettingsPage } from './shared';
import { ReadAloudVoiceRow } from './ReadAloudVoiceRow';

const { jobs: JOBS, sameAsChat: SAME_AS_CHAT } = CAPABILITIES_CONFIG;

/** A capability row: job icon + title, its description, and its control (picker or download). */
const CapabilityRow: React.FC<{
  icon: LucideIcon;
  job: { title: string; description: string };
  /** Row state, aligned with every other row's (e.g. ● Ready). */
  status?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, job, status, children }) => (
  <CardRow
    leading={<Icon icon={icon} size="sm" tone="muted" />}
    title={job.title}
    description={job.description}
    status={status}
    actions={children}
  />
);

type Controls = Record<string, LocalModelControl>;

/** Speech recognition: every speech model, with the step it still needs on its row (download, allow). */
function useSpeechChoices(controls: Controls): ModelChoice[] {
  const options = useSpeechModelOptions();
  const appleSetup = useAppleSpeechSetup();
  return useMemo(() => {
    const setupOf = (provider: string, model: string) => {
      if (provider === TRANSCRIPTION_CONFIG.appleSpeech.provider) return appleSetup ?? undefined;
      if (provider === TRANSCRIPTION_CONFIG.onDevice.provider) return downloadSetup(controls[model]);
      return undefined;
    };
    return options.map((o) => ({
      value: speechSelectionKey(o),
      provider: o.provider,
      modelId: o.model,
      label: o.label,
      ready: o.ready,
      hint: o.hint,
      setup: setupOf(o.provider, o.model),
      marks: o.live ? [LIVE_TRANSCRIPTION_MARK] : undefined,
    }));
  }, [options, appleSetup, controls]);
}

/** Read aloud engines: the macOS system voices (built in), then each local voice model with its download. */
function readAloudEngineChoices(models: LocalModel[], controls: Controls): ModelChoice[] {
  const { macos } = READ_ALOUD_CONFIG;
  const system: ModelChoice = { value: macos.id, provider: macos.provider, modelId: macos.id, label: macos.label, ready: true, hint: macos.hint };
  const local = models.filter((m) => m.kind === 'voice').map((m) => ({
    value: m.id,
    provider: LOCAL_MODELS_CONFIG.provider.id,
    modelId: m.id,
    label: m.name,
    ready: m.installed,
    hint: formatFileSize(m.bytes),
    setup: downloadSetup(controls[m.id]),
  }));
  return [system, ...local];
}

const KIND_ICON: Record<LocalModel['kind'], LucideIcon> = { speech: AudioLines, voice: Volume2 };

/** A local model on this Mac: what it's for, its size, and Download / Delete. */
const LocalModelRow: React.FC<{ model: LocalModel; control: LocalModelControl }> = ({ model, control }) => (
  <CardRow
    leading={<Icon icon={KIND_ICON[model.kind]} size="sm" tone="muted" />}
    title={model.name}
    description={`${LOCAL_MODELS_CONFIG.kindLabels[model.kind]} · ${formatFileSize(model.bytes)}`}
    status={<ModelReadyStatus model={control} />}
    actions={<ModelDownloadButton model={control} onRemove={control.remove} />}
  />
);

export const CapabilitiesPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const searchModel = useOnDeviceModel('rag');

  const chatChoices = useMemo(() => modelChoices(providers), [providers]);
  const summaryChoices = useMemo(() => modelChoices(withSummaryModels(providers, settings)), [providers, settings]);
  const { data: localModels = [] } = useLocalModels();
  const controls = useLocalModelControls();
  const speechChoices = useSpeechChoices(controls);
  const engines = useMemo(() => readAloudEngineChoices(localModels, controls), [localModels, controls]);
  const speech = speechSelectionOf(settings);
  const readAloudEngine = settings.readAloudEngine ?? READ_ALOUD_CONFIG.defaultEngine;

  const setSpeech = (key: string) => {
    const choice = speechChoices.find((c) => c.value === key);
    if (choice) setSettings({ transcriptionProvider: choice.provider, transcriptionModel: choice.modelId });
  };

  return (
    <SettingsPage title="Capabilities" description={CAPABILITIES_CONFIG.description}>
      <Section title="Conversation">
        <CapabilityRow icon={MessageSquare} job={JOBS.chat}>
          <ModelSelect value={settings.chatModel || undefined} choices={chatChoices} onChange={(chatModel) => setSettings({ chatModel })} />
        </CapabilityRow>
      </Section>

      <Section title="Speech">
        <CapabilityRow icon={AudioLines} job={JOBS.transcription}>
          <ModelSelect value={speech ? speechSelectionKey(speech) : undefined} choices={speechChoices} onChange={setSpeech} />
        </CapabilityRow>
        <CapabilityRow icon={Volume2} job={JOBS.readAloud}>
          <ModelSelect
            value={readAloudEngine}
            choices={engines}
            onChange={(engine) => setSettings({ readAloudEngine: engine, readAloudVoice: undefined })}
          />
        </CapabilityRow>
        <ReadAloudVoiceRow engine={readAloudEngine} ready={engines.find((e) => e.value === readAloudEngine)?.ready ?? false} />
      </Section>

      <Section title="Meetings">
        <CapabilityRow icon={NotebookText} job={JOBS.summaries}>
          <ModelSelect
            value={settings.analyzeModel || settings.chatModel || undefined}
            choices={summaryChoices}
            onChange={(analyzeModel) => setSettings({ analyzeModel })}
          />
        </CapabilityRow>
        <CapabilityRow icon={Waypoints} job={JOBS.knowledgeGraph}>
          <ModelSelect
            value={settings.kgExtractionModel || SAME_AS_CHAT.value}
            choices={chatChoices}
            leading={[SAME_AS_CHAT]}
            onChange={(id) => setSettings({ kgExtractionModel: id === SAME_AS_CHAT.value ? '' : id })}
          />
        </CapabilityRow>
      </Section>

      <Section title="On this Mac">
        <CapabilityRow icon={ScanSearch} job={JOBS.meetingSearch} status={<ModelReadyStatus model={searchModel} />}>
          <ModelDownloadButton model={searchModel} allowRedownload />
        </CapabilityRow>
        {localModels.map((m) => controls[m.id] && <LocalModelRow key={m.id} model={m} control={controls[m.id]} />)}
      </Section>
    </SettingsPage>
  );
};
