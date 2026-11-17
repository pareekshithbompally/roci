/** Every model choice by job; sources are providers, enabled integrations and local models. Sets the defaults. */

import React, { useMemo } from 'react';
import { AudioLines, ImageIcon, MessageSquare, NotebookText, ScanSearch, Volume2, type LucideIcon } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useOnDeviceModel, type OnDeviceModel } from '@shared/hooks/useOnDeviceModel';
import { EMBEDDING_MODEL_NAME, EMBEDDING_MODEL_SIZE } from '@extensions/rag';
import { ModelDownloadButton, ModelReadyStatus } from '@shared/components';
import { formatFileSize } from '@shared/utils/formatters';
import { modelChoices, withIntegrationModels, type ModelChoice } from '@shared/utils/modelResolver';
import { speechSelectionKey, speechSelectionOf } from '@services/ai/transcription';
import { CAPABILITIES_CONFIG } from '@config/capabilities.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { hasImageModel, imageModelOptions, imageSelectionKey } from '@services/ai/image';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';
import { downloadSetup, useLocalModelControls, useLocalModels } from '@features/settings/hooks/useLocalModels';
import { useAppleSpeechSetup } from '@features/integrations';
import { CardRow, IconTile, Section } from '@shared/ui';
import { TILE_DOMAIN, type TileTint } from '@config/ui.config';
import type { LocalModel } from '@services/localModels.service';
import { LIVE_TRANSCRIPTION_MARK, ModelSelect, SettingsPage } from './shared';
import { ReadAloudVoiceRow } from './ReadAloudVoiceRow';
import { platform } from '@platform/index';

const { jobs: JOBS } = CAPABILITIES_CONFIG;

/** A capability row: job tile (hue from its modality) + title, its description, and its picker. */
const CapabilityRow: React.FC<{
  icon: LucideIcon;
  tint: TileTint;
  job: { title: string; description: string };
  children: React.ReactNode;
}> = ({ icon, tint, job, children }) => (
  <CardRow
    leading={<IconTile icon={icon} tint={tint} />}
    leadingAlign="row"
    title={job.title}
    description={job.description}
    actions={children}
  />
);

type Controls = Record<string, OnDeviceModel>;

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

const IMAGES_OFF = IMAGE_GENERATION_CONFIG.off;

/** Image models downloaded to this Mac, each with its download step until it's ready. */
function onDeviceImageChoices(models: LocalModel[], controls: Controls): ModelChoice[] {
  if (!platform.hasOnDeviceModels) return [];
  const provider = IMAGE_GENERATION_CONFIG.onDevice.provider;
  return models.filter((m) => m.kind === 'image').map((m) => ({
    value: imageSelectionKey({ provider, model: m.id }),
    provider,
    modelId: m.id,
    label: m.name,
    ready: m.installed,
    hint: formatFileSize(m.bytes),
    setup: downloadSetup(controls[m.id]),
  }));
}

/** Image generation: cloud image models (ready once their provider has a key), models on this Mac, plus Off. */
const ImageGenerationRow: React.FC<{ localModels: LocalModel[]; controls: Controls }> = ({ localModels, controls }) => {
  const { settings, setSettings, providers } = useSettings();
  const choices = useMemo<ModelChoice[]>(() => [
    ...imageModelOptions(providers).map((o) => ({
      value: imageSelectionKey(o),
      provider: o.provider,
      modelId: o.model,
      label: o.label,
      ready: o.ready,
      hint: o.hint,
    })),
    ...onDeviceImageChoices(localModels, controls),
  ], [providers, localModels, controls]);
  const value = hasImageModel(settings)
    ? imageSelectionKey({ provider: settings.imageProvider ?? '', model: settings.imageModel ?? '' })
    : IMAGES_OFF.value;

  const choose = (key: string) => {
    const choice = choices.find((c) => c.value === key);
    setSettings({ imageProvider: choice?.provider, imageModel: choice?.modelId });
  };

  return (
    <CapabilityRow icon={ImageIcon} tint={TILE_DOMAIN.images} job={JOBS.images}>
      <ModelSelect value={value} choices={choices} onChange={choose} off={IMAGES_OFF} />
    </CapabilityRow>
  );
};

const KIND_MARK: Record<LocalModel['kind'], { icon: LucideIcon; tint: TileTint }> = {
  speech: { icon: AudioLines, tint: TILE_DOMAIN.speech },
  voice: { icon: Volume2, tint: TILE_DOMAIN.speech },
  image: { icon: ImageIcon, tint: TILE_DOMAIN.images },
};

/** A model on this Mac, whichever runtime owns it: its name, what it's for and its size, Ready, and Download / Delete. */
const OnDeviceModelRow: React.FC<{ icon: LucideIcon; tint: TileTint; name: string; use: string; size: string; control: OnDeviceModel }> = ({
  icon, tint, name, use, size, control,
}) => (
  <CardRow
    leading={<IconTile icon={icon} tint={tint} />}
    leadingAlign="row"
    title={name}
    description={`${use} · ${size}`}
    status={<ModelReadyStatus model={control} />}
    actions={<ModelDownloadButton model={control} removable />}
  />
);

export const CapabilitiesPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const searchModel = useOnDeviceModel('rag');

  const textChoices = useMemo(() => modelChoices(withIntegrationModels(providers, settings)), [providers, settings]);
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
        <CapabilityRow icon={MessageSquare} tint={TILE_DOMAIN.text} job={JOBS.chat}>
          <ModelSelect value={settings.chatModel || undefined} choices={textChoices} onChange={(chatModel) => setSettings({ chatModel })} />
        </CapabilityRow>
      </Section>

      <Section title="Speech">
        <CapabilityRow icon={AudioLines} tint={TILE_DOMAIN.speech} job={JOBS.transcription}>
          <ModelSelect value={speech ? speechSelectionKey(speech) : undefined} choices={speechChoices} onChange={setSpeech} />
        </CapabilityRow>
        {platform.hasOnDeviceModels && (
          <>
            <CapabilityRow icon={Volume2} tint={TILE_DOMAIN.speech} job={JOBS.readAloud}>
              <ModelSelect
                value={readAloudEngine}
                choices={engines}
                onChange={(engine) => setSettings({ readAloudEngine: engine, readAloudVoice: undefined })}
              />
            </CapabilityRow>
            <ReadAloudVoiceRow engine={readAloudEngine} ready={engines.find((e) => e.value === readAloudEngine)?.ready ?? false} />
          </>
        )}
      </Section>

      <Section title="Images">
        <ImageGenerationRow localModels={localModels} controls={controls} />
      </Section>

      <Section title="Meetings">
        <CapabilityRow icon={NotebookText} tint={TILE_DOMAIN.meetings} job={JOBS.summaries}>
          <ModelSelect
            value={settings.analyzeModel || settings.chatModel || undefined}
            choices={textChoices}
            onChange={(analyzeModel) => setSettings({ analyzeModel })}
          />
        </CapabilityRow>
      </Section>

      {platform.hasOnDeviceModels && (
        <Section title="On this device">
          <OnDeviceModelRow
            icon={ScanSearch}
            tint={TILE_DOMAIN.meetings}
            name={EMBEDDING_MODEL_NAME}
            use={JOBS.meetingSearch.title}
            size={EMBEDDING_MODEL_SIZE}
            control={searchModel}
          />
          {localModels.map((m) => controls[m.id] && (
            <OnDeviceModelRow
              key={m.id}
              {...KIND_MARK[m.kind]}
              name={m.name}
              use={LOCAL_MODELS_CONFIG.kindLabels[m.kind]}
              size={formatFileSize(m.bytes)}
              control={controls[m.id]}
            />
          ))}
        </Section>
      )}
    </SettingsPage>
  );
};
