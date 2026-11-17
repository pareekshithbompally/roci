/** Every model choice by job; sources are providers, enabled integrations and local models. Sets the defaults. */

import React, { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';
import { JOB_GLYPH, ModelDownloadButton } from '@shared/components';
import { formatFileSize } from '@shared/utils/formatters';
import { modelChoices, modelSources, type ModelChoice } from '@shared/utils/modelResolver';
import { speechSelectionKey, speechSelectionOf } from '@services/ai/transcription';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { hasImageModel, imageModelOptions, imageSelectionKey } from '@services/ai/image';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';
import { downloadSetup, useLocalModelControls } from '@features/settings/hooks/useLocalModels';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { useAppleSpeechSetup } from '@features/integrations';
import { CardRow, IconTile, Section, Text, type TileGlyph } from '@shared/ui';
import type { LocalModel } from '@services/localModels.service';
import { LIVE_TRANSCRIPTION_MARK, ModelSelect, SettingsPage } from './shared';
import { ReadAloudVoiceRow } from './ReadAloudVoiceRow';
import { platform } from '@platform/index';

const { jobs: JOBS, footers: FOOTERS } = DEFAULT_MODELS_CONFIG;

/** A capability row: job tile (hue from its modality), title and its picker; the section footer says what it does. */
const CapabilityRow: React.FC<{
  icon: TileGlyph;
  job: { title: string };
  children: React.ReactNode;
}> = ({ icon, job, children }) => (
  <CardRow leading={<IconTile icon={icon} />} title={job.title} actions={children} />
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

/** Image models on this device, each with its download step until it's ready. */
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

/** Image generation: cloud image models (ready once their provider has a key), models on this device, plus Off. */
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
    <CapabilityRow icon={JOB_GLYPH.images} job={JOBS.images}>
      <ModelSelect value={value} choices={choices} onChange={choose} off={IMAGES_OFF} />
    </CapabilityRow>
  );
};

/** Meeting search: the embedding model on this device, with its download step until it's ready. */
const MeetingSearchRow: React.FC<{ localModels: LocalModel[]; controls: Controls }> = ({ localModels, controls }) => {
  const model = localModels.find((m) => m.kind === 'embedding');
  const control = model && controls[model.id];
  if (!model || !control) return null;
  return (
    <CapabilityRow icon={JOB_GLYPH.meetingSearch} job={JOBS.meetingSearch}>
      {control.status === 'ready' ? <Text tone="muted">{model.name}</Text> : <ModelDownloadButton model={control} />}
    </CapabilityRow>
  );
};

export const DefaultModelsPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();

  const { data: localModels = [] } = useLocalModels();
  const textChoices = useMemo(() => modelChoices(modelSources(providers, settings, localModels)), [providers, settings, localModels]);
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
    <SettingsPage title="Default Models">
      <Section title="Conversation" footer={FOOTERS.conversation}>
        <CapabilityRow icon={JOB_GLYPH.chat} job={JOBS.chat}>
          <ModelSelect value={settings.chatModel || undefined} choices={textChoices} onChange={(chatModel) => setSettings({ chatModel })} />
        </CapabilityRow>
      </Section>

      <Section title="Speech" footer={platform.hasOnDeviceModels ? `${FOOTERS.speech} ${FOOTERS.readAloud}` : FOOTERS.speech}>
        <CapabilityRow icon={JOB_GLYPH.transcription} job={JOBS.transcription}>
          <ModelSelect value={speech ? speechSelectionKey(speech) : undefined} choices={speechChoices} onChange={setSpeech} />
        </CapabilityRow>
        {platform.hasOnDeviceModels && (
          <>
            <CapabilityRow icon={JOB_GLYPH.readAloud} job={JOBS.readAloud}>
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

      <Section title="Images" footer={FOOTERS.images}>
        <ImageGenerationRow localModels={localModels} controls={controls} />
      </Section>

      <Section title="Meetings" footer={platform.hasOnDeviceModels ? `${FOOTERS.meetings} ${FOOTERS.meetingSearch}` : FOOTERS.meetings}>
        <CapabilityRow icon={JOB_GLYPH.summaries} job={JOBS.summaries}>
          <ModelSelect
            value={settings.analyzeModel || settings.chatModel || undefined}
            choices={textChoices}
            onChange={(analyzeModel) => setSettings({ analyzeModel })}
          />
        </CapabilityRow>
        <MeetingSearchRow localModels={localModels} controls={controls} />
      </Section>

    </SettingsPage>
  );
};
