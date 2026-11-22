/** Appearance, imports, capture and transcription. */

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { SettingsPage } from './shared';
import { CardRow, ChoiceControl, Icon, Picker, Section, Switch } from '@shared/ui';

import { useLiveModeLine } from '@features/settings/hooks/useSpeechModels';
import { AUDIO_CONFIG, IMPORT_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { LAYOUT } from '@config/layout.config';
import { platform } from '@platform/index';

/** Recording sources offered in General › Capture, and what each needs from macOS. */
const CAPTURE_SOURCES = ['systemAndMicrophone', 'system', 'microphone'] as const;
const { defaultMaxConcurrent, maxConcurrentLimit } = IMPORT_CONFIG.jobProcessing;
/** Imported audio processed one at a time, or several at once up to the limit (one menu, as Apple would write it). */
const IMPORT_CONCURRENCY = [
  { value: '1', label: 'One at a time' },
  ...Array.from({ length: maxConcurrentLimit - 1 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} at once` })),
];

/** Section footers: what each group's rows do. */
const FOOTER = {
  toolActivity: 'Tool Activity shows the tools used in each answer.',
  modelIcons: 'Model icons load from huggingface.co.',
  imports: 'How many imported audio files Roci processes at the same time.',
  /** With Live Transcript on, Stop always finishes the transcript and summary, so the switch has nothing to decide. */
} as const;

/** When a recording is transcribed: one choice over the two saved settings (live transcript, transcribe after recording). */
const TRANSCRIBE_WHEN = {
  label: 'Transcribe',
  options: [
    { value: 'live', label: 'While Recording' },
    { value: 'after', label: 'After Recording' },
    { value: 'manual', label: 'Only When I Ask' },
  ],
  footer: {
    live: 'The transcript and notes build as you talk; Stop finishes them and writes the summary.',
    after: 'Stop transcribes the recording and writes the summary.',
    manual: 'Recordings are kept; transcribe one from its page when you want it.',
  },
} as const;

type TranscribeWhen = keyof typeof TRANSCRIBE_WHEN.footer;

const SETTINGS_FOR: Record<TranscribeWhen, { liveTranscription: boolean; autoTranscribe: boolean }> = {
  live: { liveTranscription: true, autoTranscribe: true },
  after: { liveTranscription: false, autoTranscribe: true },
  manual: { liveTranscription: false, autoTranscribe: false },
};

export const GeneralPanel: React.FC = () => {
  const { theme, setTheme } = useThemeContext();
  const { settings, setSettings } = useSettings();
  const liveLine = useLiveModeLine();
  const when: TranscribeWhen = settings.liveTranscription ? 'live' : settings.autoTranscribe ? 'after' : 'manual';

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
              value={settings.jobProcessing?.mode === 'parallel' ? String(settings.jobProcessing.maxConcurrent ?? defaultMaxConcurrent) : '1'}
              onChange={(n) => setSettings({
                jobProcessing: n === '1' ? { mode: 'sequential', maxConcurrent: defaultMaxConcurrent } : { mode: 'parallel', maxConcurrent: Number(n) },
              })}
              placeholder=""
              groups={[{ options: IMPORT_CONCURRENCY }]}
            />
          }
        />
      </Section>

      {platform.canCaptureSystemAudio && (
        <Section title="Capture" footer={AUDIO_CONFIG.captureSources[captureSource].requires}>
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
          footer={[TRANSCRIBE_WHEN.footer[when], when === 'live' ? liveLine : null].filter(Boolean).join(' ')}
        >
          <CardRow
            title={TRANSCRIBE_WHEN.label}
            actions={
              <div className={LAYOUT.settingsSelect}>
                <Picker
                  label={TRANSCRIBE_WHEN.label}
                  value={when}
                  onChange={(next) => setSettings(SETTINGS_FOR[next as TranscribeWhen])}
                  placeholder=""
                  groups={[{ options: [...TRANSCRIBE_WHEN.options] }]}
                />
              </div>
            }
          />
        </Section>
      )}

    </SettingsPage>
  );
};

export default GeneralPanel;
