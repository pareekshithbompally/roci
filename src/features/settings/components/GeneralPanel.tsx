/** Appearance, imports, capture and transcription. */

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { SettingsPage } from './shared';
import { CardRow, ChoiceControl, Icon, Picker, Section, Switch } from '@shared/ui';

import { useLiveModeLine } from '@features/settings/hooks/useSpeechModels';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { LAYOUT } from '@config/layout.config';
import { platform } from '@platform/index';

/** Recording sources offered in General › Capture, and what each needs from macOS. */
const CAPTURE_SOURCES = ['systemAndMicrophone', 'system', 'microphone'] as const;
/** Imported audio processed one at a time, or up to eight at once (one menu, as Apple would write it). */
const IMPORT_CONCURRENCY = [
  { value: '1', label: 'One at a time' },
  ...Array.from({ length: 7 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} at once` })),
];

/** Section footers: what each group's rows do. */
const FOOTER = {
  toolActivity: 'Tool Activity shows the tools used in each answer.',
  modelIcons: 'Model icons load from huggingface.co.',
  imports: 'How many imported audio files Roci processes at the same time.',
  /** With Live Transcript on, Stop always finishes the transcript and summary, so the switch has nothing to decide. */
  afterRecording: { live: 'With Live Transcript on, Stop always finishes the transcript and writes the summary.', off: 'Transcribe After Recording also writes the summary.' },
} as const;

const CAPTURE_HINT: Record<(typeof CAPTURE_SOURCES)[number], string> = {
  systemAndMicrophone: 'Screen Recording and Microphone access required.',
  system: 'Screen Recording permission required.',
  microphone: 'Microphone access required.',
};

export const GeneralPanel: React.FC = () => {
  const { theme, setTheme } = useThemeContext();
  const { settings, setSettings } = useSettings();
  const liveLine = useLiveModeLine();
  const live = !!settings.liveTranscription;

  const captureSource = (settings.defaultAudioSource || 'systemAndMicrophone') as (typeof CAPTURE_SOURCES)[number];

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;
  const themeTabs = themeOptions.map(({ value, icon, label }) => ({
    value,
    text: label,
    label: (
      <span className="flex items-center gap-1.5">
        <Icon icon={icon} size="xs" />
        {label}
      </span>
    ),
  }));

  return (
    <SettingsPage pane="general">
      {/* Appearance — theme + import processing */}
      <Section
        title="Appearance"
        footer={`${FOOTER.toolActivity} ${FOOTER.modelIcons}`}
      >
        <CardRow title="Theme" actions={<ChoiceControl label="Theme" items={themeTabs} value={theme} onValueChange={setTheme} />} />

        {/* Model icons — opt-in: loads org avatars from huggingface.co for servers' models, on every platform */}
        <CardRow
          title="Model Icons"
          actions={
            <Switch
              checked={!!settings.showModelAvatars}
              onCheckedChange={(checked) => setSettings({ showModelAvatars: checked })}
              aria-label="Show model icons"
            />
          }
        />

        <CardRow
          title="Tool Activity"
          actions={
            <Switch
              checked={!settings.hideToolCalls}
              onCheckedChange={(checked) => setSettings({ hideToolCalls: !checked })}
              aria-label="Show tool activity"
            />
          }
        />

      </Section>

      <Section title="Imports" footer={FOOTER.imports}>
        <CardRow
          title="Audio Processing"
          actions={
            <Picker
              label="Audio processing"
              value={settings.jobProcessing?.mode === 'parallel' ? String(settings.jobProcessing.maxConcurrent ?? 2) : '1'}
              onChange={(n) => setSettings({
                jobProcessing: n === '1' ? { mode: 'sequential', maxConcurrent: 2 } : { mode: 'parallel', maxConcurrent: Number(n) },
              })}
              placeholder=""
              groups={[{ options: IMPORT_CONCURRENCY }]}
            />
          }
        />
      </Section>

      {platform.canCaptureSystemAudio && (
        <Section title="Capture" footer={CAPTURE_HINT[captureSource]}>
          <CardRow
            title="Input Source"
            actions={
              <div className={LAYOUT.settingsSelect}>
                <Picker
                  label="Input source"
                  value={captureSource}
                  onChange={(source) => setSettings({ defaultAudioSource: source as AudioCaptureSource })}
                  placeholder=""
                  groups={[{ options: CAPTURE_SOURCES.map((source) => ({ value: source, label: AUDIO_CONFIG.captureSources[source].label })) }]}
                />
              </div>
            }
          />
        </Section>
      )}

      {platform.canRecord && (
        <Section
          title="Transcription"
          footer={[TRANSCRIPTION_CONFIG.liveCopy.description, liveLine, FOOTER.afterRecording[live ? 'live' : 'off']].filter(Boolean).join(' ')}
        >
          <CardRow
            title={TRANSCRIPTION_CONFIG.liveCopy.title}
            actions={
              <Switch
                checked={live}
                onCheckedChange={(checked) => setSettings({ liveTranscription: checked })}
                aria-label={TRANSCRIPTION_CONFIG.liveCopy.title}
              />
            }
          />
          <CardRow
            title="Transcribe After Recording"
            actions={
              <Switch
                checked={live || !!settings.autoTranscribe}
                disabled={live}
                onCheckedChange={(checked) => setSettings({ autoTranscribe: checked })}
                aria-label="Transcribe after recording"
              />
            }
          />
        </Section>
      )}

    </SettingsPage>
  );
};

export default GeneralPanel;
