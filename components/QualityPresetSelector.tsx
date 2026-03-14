import React from 'react';
import { AUDIO_CONFIG, AudioQualitySettings, getQualityPreset, formatAudioQuality } from '../src/config/audio.config';
import { Mic, Radio, Music, Briefcase } from 'lucide-react';

interface QualityPresetSelectorProps {
  selectedPreset: keyof typeof AUDIO_CONFIG.presets;
  onPresetChange: (preset: keyof typeof AUDIO_CONFIG.presets) => void;
  className?: string;
}

/**
 * QualityPresetSelector Component
 * 
 * Allows users to select audio quality presets for recording.
 * Shows preset name, description, and technical specifications.
 */
const QualityPresetSelector: React.FC<QualityPresetSelectorProps> = ({
  selectedPreset,
  onPresetChange,
  className,
}) => {
  const presets = AUDIO_CONFIG.presets;

  /**
   * Get icon for preset
   */
  const getPresetIcon = (presetKey: keyof typeof AUDIO_CONFIG.presets) => {
    const icons = {
      voice: Mic,
      podcast: Radio,
      music: Music,
      professional: Briefcase,
    };
    const Icon = icons[presetKey];
    return Icon;
  };

  return (
    <div className={`space-y-3 ${className || ''}`}>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Audio Quality
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(presets) as Array<keyof typeof presets>).map((presetKey) => {
          const preset = presets[presetKey];
          const Icon = getPresetIcon(presetKey);
          const isSelected = selectedPreset === presetKey;
          const settings = getQualityPreset(presetKey);

          return (
            <button
              key={presetKey}
              onClick={() => onPresetChange(presetKey)}
              className={`
                flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left
                ${
                  isSelected
                    ? 'border-zinc-900 bg-zinc-100 dark:bg-zinc-800'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600'
                }
                focus:outline-none focus:ring-2 focus:ring-zinc-300
              `}
              aria-pressed={isSelected}
              aria-label={`Select ${preset.name} quality preset`}
            >
              {/* Icon */}
              <div
                className={`
                  shrink-0 p-2 rounded-lg
                  ${
                    isSelected
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }
                `}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`
                      text-sm font-semibold
                      ${
                        isSelected
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }
                    `}
                  >
                    {preset.name}
                  </h3>
                  
                  {isSelected && (
                    <div className="shrink-0 w-2 h-2 rounded-full bg-zinc-900" aria-label="Selected" />
                  )}
                </div>

                <p
                  className={`
                    text-xs mt-1
                    ${
                      isSelected
                        ? 'text-zinc-700 dark:text-zinc-300'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }
                  `}
                >
                  {preset.description}
                </p>

                {/* Technical Specs */}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`
                      text-[10px] font-mono px-1.5 py-0.5 rounded
                      ${
                        isSelected
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }
                    `}
                  >
                    {formatAudioQuality(settings)}
                  </span>

                  {preset.noiseSuppression && (
                    <span
                      className={`
                        text-[10px] px-1.5 py-0.5 rounded
                        ${
                          isSelected
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }
                      `}
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
      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">Tip:</span> Voice quality (16kHz) is optimized for AI transcription and uses less storage.
          Higher quality settings are better for music or when you need pristine audio.
        </p>
      </div>
    </div>
  );
};

export default QualityPresetSelector;
