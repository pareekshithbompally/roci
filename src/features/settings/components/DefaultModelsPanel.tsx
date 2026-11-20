/** Every model choice by job; sources are providers, enabled integrations and local models. Sets the defaults. */

import React, { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';
import { JOB_GLYPH, ModelDownloadButton } from '@shared/components';
import { formatFileSize } from '@shared/utils/formatters';
import { modelSources, type ModelChoice } from '@shared/utils/modelResolver';
import { jobChoices, modelKey } from '@services/ai/models';
import { cloudVoiceOptions } from '@services/ai/speech';
import type { ModelProvider } from '@shared/types/modelProviders';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { speechSelectionOf } from '@services/ai/transcription';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { hasImageModel, imageModelOptions } from '@services/ai/image';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';
import { downloadSetup, useLocalModelControls } from '@features/settings/hooks/useLocalModels';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { useAppleSpeechSetup } from '@features/integrations';
import { CardRow, IconTile, Section, Switch, Text, type TileGlyph } from '@shared/ui';
import type { LocalModel } from '@services/localModels.service';
import { LIVE_TRANSCRIPTION_MARK, ModelSelect, SettingsPage } from './shared';
import { ReadAloudVoiceRow } from './ReadAloudVoiceRow';
import { platform } from '@platform/index';

const { jobs: JOBS, footers: FOOTERS, chatExtras: EXTRAS } = DEFAULT_MODELS_CONFIG;

/** A capability row: job tile (hue from its modality), title and its picker; the section footer says what it does. Off
 *  (`disabled`) while every job it serves is switched off. */
const CapabilityRow: React.FC<{
  icon: TileGlyph;
  job: { title: string };
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ icon, job, disabled, children }) => (
  <CardRow leading={<IconTile icon={icon} />} title={job.title} actions={children} disabled={disabled} />
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
      value: modelKey(o),
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

/** Read aloud engines: the system voices (built in), each local voice model with its download, then cloud voice models. */
function readAloudEngineChoices(models: LocalModel[], controls: Controls, providers: ModelProvider[]): ModelChoice[] {
  const { system: voices } = READ_ALOUD_CONFIG;
  const system: ModelChoice = { value: voices.id, provider: voices.provider, modelId: voices.id, label: voices.label, ready: true, hint: voices.hint };
  const local = models.filter((m) => m.kind === 'voice').map((m) => ({
    value: m.id,
    provider: LOCAL_MODELS_CONFIG.provider.id,
    modelId: m.id,
    label: m.name,
    ready: m.installed,
    hint: formatFileSize(m.bytes),
    setup: downloadSetup(controls[m.id]),
  }));
  const cloud = cloudVoiceOptions(providers).map((o) => ({
    value: modelKey(o),
    provider: o.provider,
    modelId: o.model,
    label: o.label,
    ready: o.ready,
    hint: o.hint,
  }));
  return [system, ...local, ...cloud];
}

const IMAGES_OFF = IMAGE_GENERATION_CONFIG.off;

/** Image generation: cloud image models (ready once their provider has a key), plus Off. */
const ImageGenerationRow: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const choices = useMemo<ModelChoice[]>(() => [
    ...imageModelOptions(providers).map((o) => ({
      value: modelKey(o),
      provider: o.provider,
      modelId: o.model,
      label: o.label,
      ready: o.ready,
      hint: o.hint,
    })),
  ], [providers]);
  const value = hasImageModel(settings)
    ? modelKey({ provider: settings.imageProvider ?? '', model: settings.imageModel ?? '' })
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

/** Titles & follow-ups: a switch for each, then the one model that does both in one call ("Same as chat" = the chat's
 *  own); the picker is off while both are. */
const ChatExtrasSection: React.FC<{ choices: ModelChoice[] }> = ({ choices }) => {
  const { settings, setSettings } = useSettings();
  const titles = settings.chatTitles !== false;
  const followUps = settings.followUps !== false;
  const { sameAsChat } = EXTRAS;
  return (
    <Section title={EXTRAS.section} footer={FOOTERS.chatExtras}>
      <CardRow
        title={EXTRAS.titles}
        actions={<Switch checked={titles} onCheckedChange={(chatTitles) => setSettings({ chatTitles })} aria-label={EXTRAS.titles} />}
      />
      <CardRow
        title={EXTRAS.followUps}
        actions={<Switch checked={followUps} onCheckedChange={(on) => setSettings({ followUps: on })} aria-label={EXTRAS.followUps} />}
      />
      <CapabilityRow icon={JOB_GLYPH.chat} job={JOBS.chatExtras} disabled={!titles && !followUps}>
        <ModelSelect
          value={settings.chatExtrasModel || sameAsChat.value}
          choices={choices}
          off={sameAsChat}
          onChange={(key) => setSettings({ chatExtrasModel: key === sameAsChat.value ? undefined : key })}
        />
      </CapabilityRow>
    </Section>
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
  const catalogLoaded = useModelCatalog();
  const textChoices = useMemo(
    () => jobChoices(modelSources(providers, settings, localModels), 'chat'),
    [providers, settings, localModels, catalogLoaded],
  );
  const controls = useLocalModelControls();
  const speechChoices = useSpeechChoices(controls);
  const engines = useMemo(
    () => readAloudEngineChoices(localModels, controls, providers),
    [localModels, controls, providers, catalogLoaded],
  );
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

      <ChatExtrasSection choices={textChoices} />

      <Section title="Speech" footer={platform.hasLocalModels ? `${FOOTERS.speech} ${FOOTERS.readAloud}` : FOOTERS.speech}>
        <CapabilityRow icon={JOB_GLYPH.transcription} job={JOBS.transcription}>
          <ModelSelect value={speech ? modelKey(speech) : undefined} choices={speechChoices} onChange={setSpeech} />
        </CapabilityRow>
        {platform.hasLocalModels && (
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
        <ImageGenerationRow />
      </Section>

      <Section title="Meetings" footer={platform.hasLocalModels ? `${FOOTERS.meetings} ${FOOTERS.meetingSearch}` : FOOTERS.meetings}>
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
