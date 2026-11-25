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
import { GENERAL_COPY as COPY } from '@config/settingsCopy.config';
import { platform } from '@platform/index';

/** Recording sources offered in General › Capture, and what each needs from macOS. */
const CAPTURE_SOURCES = ['systemAndMicrophone', 'system', 'microphone'] as const;
const { defaultMaxConcurrent, maxConcurrentLimit } = IMPORT_CONFIG.jobProcessing;
/** Imported audio processed one at a time, or several at once up to the limit (one menu, as Apple would write it). */
const IMPORT_CONCURRENCY = [
  { value: '1', label: COPY.oneAtATime },
  ...Array.from({ length: maxConcurrentLimit - 1 }, (_, i) => ({ value: String(i + 2), label: COPY.atOnce(i + 2) })),
];

type TranscribeWhen = keyof typeof COPY.transcribe.footer;

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
    { value: 'light', icon: Sun, label: COPY.themes.light },
    { value: 'dark', icon: Moon, label: COPY.themes.dark },
    { value: 'system', icon: Monitor, label: COPY.themes.system },
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
        title={COPY.appearance}
        footer={COPY.appearanceFooter}
      >
        <CardRow title={COPY.theme} actions={<ChoiceControl label={COPY.theme} items={themeTabs} value={theme} onValueChange={setTheme} />} />

        {/* Model icons — opt-in: loads org avatars from huggingface.co for servers' models, on every platform */}
        <CardRow
          title={COPY.modelIcons}
          actions={
            <Switch
              checked={!!settings.showModelAvatars}
              onCheckedChange={(checked) => setSettings({ showModelAvatars: checked })}
              aria-label={COPY.showModelIcons}
            />
          }
        />

        <CardRow
          title={COPY.toolActivity}
          actions={
            <Switch
              checked={!settings.hideToolCalls}
              onCheckedChange={(checked) => setSettings({ hideToolCalls: !checked })}
              aria-label={COPY.showToolActivity}
            />
          }
        />

      </Section>

      {platform.hasHaptics && (
        <Section title={COPY.haptics} footer={COPY.hapticsFooter}>
          <CardRow
            title={COPY.haptics}
            actions={<Switch checked={settings.haptics !== false} onCheckedChange={(checked) => setSettings({ haptics: checked })} aria-label={COPY.haptics} />}
          />
        </Section>
      )}

      <Section title={COPY.imports} footer={COPY.importsFooter}>
        <CardRow
          title={COPY.audioProcessing}
          actions={
            <Picker
              label={COPY.audioProcessing}
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
        <Section title={COPY.capture} footer={AUDIO_CONFIG.captureSources[captureSource].requires}>
          <CardRow
            title={COPY.inputSource}
            actions={
              <div className={LAYOUT.settingsSelect}>
                <Picker
                  label={COPY.inputSource}
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
          title={COPY.transcription}
          footer={[COPY.transcribe.footer[when], when === 'live' ? liveLine : null].filter(Boolean).join(' ')}
        >
          <CardRow
            title={COPY.transcribe.label}
            actions={
              <div className={LAYOUT.settingsSelect}>
                <Picker
                  label={COPY.transcribe.label}
                  value={when}
                  onChange={(next) => setSettings(SETTINGS_FOR[next as TranscribeWhen])}
                  placeholder=""
                  groups={[{ options: [...COPY.transcribe.options] }]}
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
