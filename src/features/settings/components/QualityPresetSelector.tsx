import React from 'react';
import { Mic, Radio, Music, Briefcase } from 'lucide-react';
import { AUDIO_CONFIG, getQualityPreset, formatAudioQuality } from '@config/audio.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, COMPONENT } from '@config/theme.config';
import { InfoCallout } from './shared';

interface QualityPresetSelectorProps {
  value: keyof typeof AUDIO_CONFIG.presets;
  onChange: (preset: keyof typeof AUDIO_CONFIG.presets) => void;
  className?: string;
}

const presetIcons = {
  voice: Mic,
  podcast: Radio,
  music: Music,
  professional: Briefcase,
} as const;

const QualityPresetSelector: React.FC<QualityPresetSelectorProps> = ({
  value,
  onChange,
  className,
}) => {
  const presets = AUDIO_CONFIG.presets;

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(presets) as Array<keyof typeof presets>).map((presetKey) => {
          const preset = presets[presetKey];
          const Icon = presetIcons[presetKey];
          const isSelected = value === presetKey;
          const settings = getQualityPreset(presetKey);

          return (
            <button
              key={presetKey}
              onClick={() => onChange(presetKey)}
              aria-pressed={isSelected}
              aria-label={`Select ${preset.name} quality preset`}
              className={`flex items-start gap-3 p-3 ${RADIUS.md} border-2 transition-all text-left focus:outline-none ${BORDER.inputFocus} ${
                isSelected
                  ? `${BORDER.selectedCard} ${SURFACE.selectedCard}`
                  : `${BORDER.default} ${SURFACE.card} ${BORDER.cardHover}`
              }`}
            >
              {/* Icon */}
              <div
                className={`shrink-0 p-2 ${RADIUS.md} ${
                  isSelected
                    ? `${COMPONENT.primaryButton}`
                    : `${SURFACE.chip} ${TEXT.muted}`
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                    {preset.name}
                  </h3>
                  {isSelected && (
                    <div className="shrink-0 w-2 h-2 rounded-full bg-parchment-900 dark:bg-night-100" aria-label="Selected" />
                  )}
                </div>

                <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} mt-1 ${isSelected ? TEXT.secondary : TEXT.muted}`}>
                  {preset.description}
                </p>

                {/* Technical Specs */}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isSelected
                        ? `${COMPONENT.primaryButton}`
                        : `${SURFACE.chip} ${TEXT.secondary}`
                    }`}
                  >
                    {formatAudioQuality(settings)}
                  </span>

                  {preset.noiseSuppression && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isSelected
                          ? `${COMPONENT.primaryButton}`
                          : `${SURFACE.chip} ${TEXT.secondary}`
                      }`}
                    >
                      Noise Reduction
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current Settings Info */}
      <InfoCallout variant="neutral">
        <span className="font-medium">Tip:</span> Voice quality (16kHz) is optimized for AI transcription and uses less storage.
        Higher quality settings are better for music or when you need pristine audio.
      </InfoCallout>
    </div>
  );
};

export default QualityPresetSelector;
