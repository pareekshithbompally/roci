/**
 * AudioPanel Component
 *
 * Settings panel for audio recording configuration.
 * Two model pickers: Transcription engine (STT) and Analyze model (Overview LLM).
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
import { modalitiesService } from '@services/modalities';
import { getProviderTitle } from '@shared/utils/provider.utils';
import ProvidersAvatar from '@shared/components/ProvidersAvatar';
import { SettingsSection, InfoCallout } from './shared';
import { LAYOUT } from '@config/theme.config';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@shared/ui';
import { ENGINES, resolveCred } from '@services/ai/transcription';
import type { TranscriptionEngine } from '@services/ai/transcription';

export const AudioPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const { hasUnsavedChanges } = useSettingsSave('Audio settings', 'audio');
  const { showToast } = useToast();
  const [modalitiesLoaded, setModalitiesLoaded] = useState(modalitiesService.isLoaded());

  useEffect(() => {
    modalitiesService.ensureLoaded().then(() => setModalitiesLoaded(true));
  }, []);

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

  /** Which engines can transcribe (key present) vs not */
  const engineStates = useMemo(() => {
    return Object.values(ENGINES).map((engine) => {
      let hasKey = false;
      try {
        resolveCred(engine.providerId, providers);
        hasKey = true;
      } catch {
        hasKey = false;
      }
      return { engine, hasKey };
    });
  }, [providers]);

  const handleTranscriptionEngineChange = (engineId: string) => {
    setSettings({ transcriptionModel: engineId });
    const engine = ENGINES[engineId as keyof typeof ENGINES];
    if (engine) {
      try {
        resolveCred(engine.providerId, providers);
        showToast(`${engine.label} is ready`, 'success');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Missing API key';
        showToast(msg, 'warning');
      }
    }
  };

  const handleAnalyzeModelChange = (modelId: string) => {
    setSettings({ analyzeModel: modelId });
  };

  const handleSourceChange = (source: AudioCaptureSource) => {
    setSettings({ defaultAudioSource: source });
  };

  const handleQualityChange = (preset: string) => {
    setSettings({ audioQualityPreset: preset as any });
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
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Audio Recording
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Configure transcription, analysis, input source, and recording quality.
        </p>
      </div>

      <SettingsSection title="Recording">
        <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>

        {/* Transcription Engine row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Transcription Engine
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              Speech-to-text provider for the Transcript tab.
            </p>
          </div>
          <div className="w-64 shrink-0">
            <Select
              value={settings.transcriptionModel || undefined}
              onValueChange={handleTranscriptionEngineChange}
            >
              <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                <SelectValue placeholder="Select engine">
                  {(() => {
                    const engine = ENGINES[settings.transcriptionModel as keyof typeof ENGINES];
                    if (!engine) return 'Select engine';
                    return (
                      <span className="flex items-center gap-2 truncate">
                        <ProvidersAvatar provider={engine.providerId} size={16} />
                        <span className="truncate">{engine.label}</span>
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {engineStates.map(({ engine, hasKey }) => (
                  <SelectItem
                    key={`engine-${engine.id}`}
                    value={engine.id}
                    disabled={!hasKey}
                  >
                    <div className="flex items-center gap-2">
                      <ProvidersAvatar provider={engine.providerId} size={16} />
                      <span className="truncate">{engine.label}</span>
                      {!hasKey && (
                        <span className="text-xs text-[var(--text-faint)]">
                          Add {engine.providerId.charAt(0).toUpperCase() + engine.providerId.slice(1)} API key
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Analyze Model row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Analyze Model
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              LLM that generates the Overview summary from the transcript.
            </p>
          </div>
          <div className="w-64 shrink-0">
            {allActiveModels.length > 0 ? (
              <Select
                value={settings.analyzeModel || settings.chatModel || undefined}
                onValueChange={handleAnalyzeModelChange}
              >
                <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                  <SelectValue placeholder="Select model">
                    {(() => {
                      const selId = settings.analyzeModel || settings.chatModel;
                      const selected = allActiveModels.find(m => m.id === selId);
                      if (!selected) return 'Select model';
                      return (
                        <span className="flex items-center gap-2 truncate">
                          <ProvidersAvatar provider={selected.provider} size={16} />
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
                              <ProvidersAvatar provider={model.provider} size={16} />
                              <span className="truncate">{model.name}</span>
                              {noStructuredOutput && (
                                <span className="text-xs text-[var(--text-warning)]">
                                  No structured output
                                </span>
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
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                No models available
              </span>
            )}
          </div>
        </div>

        {/* Input Source row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Input Source
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              {permissionHint}
            </p>
          </div>
          <div className="w-64 shrink-0">
            <Select
              value={selectedSource}
              onValueChange={(val) => handleSourceChange(val as AudioCaptureSource)}
            >
              <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="systemAndMicrophone">{sourceLabels.systemAndMicrophone}</SelectItem>
                <SelectItem value="system">{sourceLabels.system}</SelectItem>
                <SelectItem value="microphone">{sourceLabels.microphone}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audio Quality row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Audio Quality
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              {qualityDescriptions[selectedQuality] || ''}
            </p>
          </div>
          <div className="w-64 shrink-0">
            <Select
              value={selectedQuality}
              onValueChange={handleQualityChange}
            >
              <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
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
        </div>
        </div>
      </SettingsSection>

      <InfoCallout variant="neutral">
        <span className="font-medium">Tip:</span> Voice quality (16kHz) is optimized for AI transcription and uses less storage.
      </InfoCallout>

    </div>
    </div>
  );
};

export default AudioPanel;
