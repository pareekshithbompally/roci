/**
 * AudioPanel Component
 * 
 * Settings panel for audio recording configuration.
 * Allows users to select default audio input source.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Mic } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import QualityPresetSelector from './QualityPresetSelector';
import { modalitiesService } from '@/services/modalities';
import { ModalityIcons } from './ModalityIcons';
import { audioTranscriptionValidator } from '@/services/audioTranscriptionValidator';
import { getProviderTitle } from '@/utils/providerUtils';
import ProvidersAvatar from '@/components/ProvidersAvatar';
import { SettingsSaveButton } from './SettingsSaveButton';
import { SettingsSection, RadioCard, InfoCallout } from './shared';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@shared/ui';

export const AudioPanel: React.FC = () => {
  const { settings, setSettings, providers } = useSettings();
  const { setHasUnsavedChanges } = useUnsavedChanges();
  const { isSaving, hasUnsavedChanges, save } = useSettingsSave('Audio settings');
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
    setHasUnsavedChanges(true, 'audio');
    
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
    setHasUnsavedChanges(true, 'audio');
  };

  const handleQualityChange = (preset: string) => {
    setSettings({ audioQualityPreset: preset as any });
    setHasUnsavedChanges(true, 'audio');
  };

  const audioSources: Array<{ key: AudioCaptureSource; label: string; description: string }> = [
    {
      key: 'systemAndMicrophone',
      label: AUDIO_CONFIG.captureSources.systemAndMicrophone.label,
      description: AUDIO_CONFIG.captureSources.systemAndMicrophone.description,
    },
    {
      key: 'system',
      label: AUDIO_CONFIG.captureSources.system.label,
      description: AUDIO_CONFIG.captureSources.system.description,
    },
    {
      key: 'microphone',
      label: AUDIO_CONFIG.captureSources.microphone.label,
      description: AUDIO_CONFIG.captureSources.microphone.description,
    },
  ];

  const selectedSource = settings.defaultAudioSource || 'systemAndMicrophone';

  return (
    <div className="space-y-8">
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Audio Recording
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Configure your default recording input source.
        </p>
      </div>

      {/* Recording Input Source */}
      <SettingsSection title="Default Input Source">
        <div className="space-y-3">
          {audioSources.map(({ key, label, description }) => (
            <RadioCard
              key={key}
              selected={selectedSource === key}
              onClick={() => handleSourceChange(key)}
              showDot
            >
              <div className="flex items-center gap-2 mb-1">
                <Mic className={`w-4 h-4 ${TEXT.faint}`} />
                <span
                  className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${
                    selectedSource === key
                      ? TEXT.heading
                      : TEXT.secondary
                  }`}
                >
                  {label}
                </span>
              </div>
              <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>{description}</p>
            </RadioCard>
          ))}
        </div>
      </SettingsSection>

      {/* Audio Quality */}
      <SettingsSection title="Audio Quality">
        <QualityPresetSelector
          value={settings.audioQualityPreset}
          onChange={handleQualityChange}
        />
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
          Higher quality produces larger file sizes but better transcription accuracy.
        </p>
      </SettingsSection>

      {/* Transcription Model */}
      <SettingsSection title="Transcription Model">
        {allActiveModels.length > 0 ? (
          <div className="space-y-2">
            <Select
              value={settings.transcriptionModel || undefined}
              onValueChange={handleTranscriptionModelChange}
            >
              <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                <SelectValue placeholder="Select a model" />
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
                          <span>{model.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {!settings.transcriptionModel && (
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                Select a model used for transcribing audio recordings.
              </p>
            )}
          </div>
        ) : (
          <InfoCallout variant="info">
            No models available. Go to <strong>Model Providers</strong> to enable providers and add models first.
          </InfoCallout>
        )}
      </SettingsSection>

      {/* Permission Note */}
      <InfoCallout variant="info">
        <strong>Note:</strong> System permissions will be requested when you start your first recording.
        {selectedSource === 'systemAndMicrophone' && ' Both Screen Recording and Microphone access are required.'}
        {selectedSource === 'system' && ' Screen Recording permission is required.'}
        {selectedSource === 'microphone' && ' Microphone access is required.'}
      </InfoCallout>

      {/* Save Button */}
      <SettingsSaveButton
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={save}
      />
    </div>
  );
};

export default AudioPanel;
