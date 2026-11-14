/**
 * AudioPanel Component
 *
 * Settings panel for audio recording configuration.
 * Two model pickers: Transcription engine (STT) and Analyze model (Overview LLM).
 */

import React, { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';

import { useModalities } from '@features/settings/stores/modalitiesStore';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { modalitiesService } from '@services/modalities';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { ProvidersAvatar, ModelIcon } from '@shared/components';
import { SettingsPage } from './shared';
import { Callout, CardRow, Section, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, Text } from '@shared/ui';
import { speechSelectionKey, speechSelectionOf } from '@services/ai/transcription';
import type { SpeechModelOption } from '@services/ai/transcription';
import { useSpeechModelOptions } from '@features/settings/hooks/useSpeechModels';

export const AudioPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const { showToast } = useToast();
  const modalitiesLoaded = useModalities();


  const allActiveModels = useMemo(() => {
    const models: Array<{ id: string; provider: string; name: string }> = [];
    providers.forEach(provider => {
      if (provider.active && provider.models) {
        provider.models.forEach(model => {
          models.push({
            id: model.id,
            provider: provider.provider,
            name: model.name || model.id,
          });
        });
      }
    });
    return models;
  }, [providers]);

  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, typeof allActiveModels> = {};
    allActiveModels.forEach((model) => {
      if (!grouped[model.provider]) grouped[model.provider] = [];
      grouped[model.provider].push(model);
    });
    return grouped;
  }, [allActiveModels]);

  /** Speech models grouped by provider, in picker order (cloud, local servers, Hex). */
  const speechOptions = useSpeechModelOptions();
  const speechGroups = useMemo(() => {
    const groups = new Map<string, SpeechModelOption[]>();
    speechOptions.forEach((o) => groups.set(o.provider, [...(groups.get(o.provider) ?? []), o]));
    return [...groups.entries()];
  }, [speechOptions]);
  const selectedSpeech = speechSelectionOf(settings);
  const selectedSpeechOption = selectedSpeech
    ? speechOptions.find((o) => speechSelectionKey(o) === speechSelectionKey(selectedSpeech))
    : undefined;

  const handleSpeechModelChange = (key: string) => {
    const option = speechOptions.find((o) => speechSelectionKey(o) === key);
    if (!option) return;
    setSettings({ transcriptionProvider: option.provider, transcriptionModel: option.model });
    showToast(`${option.label} is ready`, 'success');
  };

  const handleAnalyzeModelChange = (modelId: string) => {
    setSettings({ analyzeModel: modelId });
  };

  const handleSourceChange = (source: AudioCaptureSource) => {
    setSettings({ defaultAudioSource: source });
  };

  const handleQualityChange = (preset: string) => {
    if (
      preset === 'voice' ||
      preset === 'podcast' ||
      preset === 'music' ||
      preset === 'professional'
    ) {
      setSettings({ audioQualityPreset: preset });
    } else {
      console.error('[AudioPanel] Unknown quality preset:', preset);
    }
  };

  const selectedSource = settings.defaultAudioSource || 'systemAndMicrophone';
  const selectedQuality = settings.audioQualityPreset || 'voice';

  const sourceLabels: Record<AudioCaptureSource, string> = {
    systemAndMicrophone: AUDIO_CONFIG.captureSources.systemAndMicrophone.label,
    system: AUDIO_CONFIG.captureSources.system.label,
    microphone: AUDIO_CONFIG.captureSources.microphone.label,
    'file-upload': 'File Upload',
  };

  const qualityDescriptions: Record<string, string> = {
    voice: '16kHz \u00B7 64kbps \u00B7 Noise reduction',
    podcast: '24kHz \u00B7 96kbps \u00B7 Noise reduction',
    music: '44.1kHz \u00B7 128kbps',
    professional: '48kHz \u00B7 192kbps',
  };

  const permissionHint = selectedSource === 'systemAndMicrophone'
    ? 'Screen Recording and Microphone access required.'
    : selectedSource === 'system'
    ? 'Screen Recording permission required.'
    : 'Microphone access required.';

  return (
    <SettingsPage
      title="Audio Recording"
      description="Configure transcription, analysis, input source, and recording quality."
    >
      <Section title="Recording">
        {/* Transcription Model — any provider's speech model, like the Analyze model */}
        <CardRow
          title="Transcription Model"
          description="Speech-to-text for recordings, imports and dictation."
          actions={
            <div className="w-64">
              <Select
                value={selectedSpeech ? speechSelectionKey(selectedSpeech) : undefined}
                onValueChange={handleSpeechModelChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model">
                    {selectedSpeech && (
                      <span className="flex items-center gap-2 truncate">
                        <ProvidersAvatar provider={selectedSpeech.provider} size={16} />
                        <span className="truncate">{selectedSpeechOption?.label ?? selectedSpeech.model}</span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {speechGroups.map(([provider, options]) => (
                    <SelectGroup key={`speech-${provider}`}>
                      <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
                      {options.map((option) => (
                        <SelectItem
                          key={`speech-${speechSelectionKey(option)}`}
                          value={speechSelectionKey(option)}
                          disabled={!option.ready}
                        >
                          <div className="flex items-center gap-2">
                            <ProvidersAvatar provider={option.provider} size={16} />
                            <span className="truncate">{option.label}</span>
                            {option.hint && <Text variant="helper" tone="faint">{option.hint}</Text>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <CardRow
          title="Analyze Model"
          description="LLM that generates the Overview summary from the transcript."
          actions={
            <div className="w-64">
              {allActiveModels.length > 0 ? (
                <Select
                  value={settings.analyzeModel || settings.chatModel || undefined}
                  onValueChange={handleAnalyzeModelChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model">
                      {(() => {
                        const selId = settings.analyzeModel || settings.chatModel;
                        const selected = allActiveModels.find(m => m.id === selId);
                        if (!selected) return 'Select model';
                        return (
                          <span className="flex items-center gap-2 truncate">
                            <ModelIcon provider={selected.provider} modelId={selected.id} size={16} />
                            <span className="truncate">{selected.name}</span>
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(modelsByProvider).map(([provider, models]) => (
                      <SelectGroup key={provider}>
                        <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
                        {models.map((model) => {
                          const modelInfo = modalitiesLoaded
                            ? modalitiesService.getModelInfo(model.provider, model.id)
                            : null;
                          const noStructuredOutput =
                            modelInfo?.capabilities?.structuredOutput === false;
                          return (
                            <SelectItem
                              key={`analyze-${model.provider}-${model.id}`}
                              value={model.id}
                            >
                              <div className="flex items-center gap-2">
                                <ModelIcon provider={model.provider} modelId={model.id} size={16} />
                                <span className="truncate">{model.name}</span>
                                {noStructuredOutput && (
                                  <Text variant="helper" tone="warning">No structured output</Text>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Text variant="helper" tone="faint">No models available</Text>
              )}
            </div>
          }
        />

        <CardRow
          title="Input Source"
          description={permissionHint}
          actions={
            <div className="w-64">
              <Select
                value={selectedSource}
                onValueChange={(val) => handleSourceChange(val as AudioCaptureSource)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="systemAndMicrophone">{sourceLabels.systemAndMicrophone}</SelectItem>
                  <SelectItem value="system">{sourceLabels.system}</SelectItem>
                  <SelectItem value="microphone">{sourceLabels.microphone}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <CardRow
          title="Audio Quality"
          description={qualityDescriptions[selectedQuality] || ''}
          actions={
            <div className="w-64">
              <Select value={selectedQuality} onValueChange={handleQualityChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIO_CONFIG.presets) as Array<keyof typeof AUDIO_CONFIG.presets>).map((key) => (
                    <SelectItem key={key} value={key}>
                      {AUDIO_CONFIG.presets[key].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      </Section>

      <Callout variant="neutral">
        <Text variant="label" tone="inherit">Tip:</Text> Voice quality (16kHz) is optimized for AI transcription and uses less storage.
      </Callout>
    </SettingsPage>
  );
};

export default AudioPanel;
