/**
 * AudioPanel Component
 *
 * Settings panel for audio recording configuration.
 * Compact layout: transcription model, input source, audio quality.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
import { modalitiesService } from '@services/modalities';
import { audioTranscriptionValidator } from '@services/audioTranscriptionValidator';
import { getProviderTitle } from '@shared/utils/provider.utils';
import ProvidersAvatar from '@shared/components/ProvidersAvatar';
import { SettingsSection, InfoCallout } from './shared';
import { LAYOUT } from '@config/theme.config';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@shared/ui';

export const AudioPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const { hasUnsavedChanges } = useSettingsSave('Audio settings', 'audio');
  const { showToast } = useToast();
  const [modalitiesLoaded, setModalitiesLoaded] = useState(modalitiesService.isLoaded());

  useEffect(() => {
    modalitiesService.ensureLoaded().then(() => setModalitiesLoaded(true));
  }, []);

  const allActiveModels = React.useMemo(() => {
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

  const handleTranscriptionModelChange = async (modelId: string) => {
    setSettings({ transcriptionModel: modelId });

    if (modelId) {
      const modelProvider = providers.find(p =>
        p.models?.some(m => m.id === modelId)
      );

      if (modelProvider) {
        try {
          const validation = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
            modelId,
            modelProvider
          );

          if (validation.success) {
            showToast(validation.message, 'success');
          } else {
            showToast(validation.message, 'warning');
          }
        } catch (error: unknown) {
          console.error('[AudioPanel] Failed to validate transcription model:', error);
        }
      }
    }
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
    voice: '16kHz · 64kbps · Noise reduction',
    podcast: '24kHz · 96kbps · Noise reduction',
    music: '44.1kHz · 128kbps',
    professional: '48kHz · 192kbps',
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
          Configure transcription, input source, and recording quality.
        </p>
      </div>

      {/* Transcription Model + Input Source + Quality — compact inline rows */}
      <SettingsSection title="Recording">
        <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>
        {/* Transcription Model row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Transcription Model
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              Model used for transcribing audio.
            </p>
          </div>
          <div className="w-64 shrink-0">
            {allActiveModels.length > 0 ? (
              <Select
                value={settings.transcriptionModel || undefined}
                onValueChange={handleTranscriptionModelChange}
              >
                <SelectTrigger className={`${TYPOGRAPHY_CLASSES.settingsInput}`}>
                  <SelectValue placeholder="Select model">
                    {(() => {
                      const selected = allActiveModels.find(m => m.id === settings.transcriptionModel);
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
                      {models.map((model) => (
                        <SelectItem
                          key={`transcription-${model.provider}-${model.id}`}
                          value={model.id}
                        >
                          <div className="flex items-center gap-2">
                            <ProvidersAvatar provider={model.provider} size={16} />
                            <span className="truncate">{model.name}</span>
                          </div>
                        </SelectItem>
                      ))}
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

      {/* Tip */}
      <InfoCallout variant="neutral">
        <span className="font-medium">Tip:</span> Voice quality (16kHz) is optimized for AI transcription and uses less storage.
      </InfoCallout>

    </div>
    </div>
  );
};

export default AudioPanel;
