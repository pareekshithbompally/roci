/** Appearance, imports, capture, transcription and version; the version comes from systemInfoStore. */

import React, { useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useSystemInfo } from '@features/settings/stores/systemInfoStore';
import { SettingsPage } from './shared';
import { Button, CardRow, ChoiceControl, Icon, Picker, Section, Switch, Text } from '@shared/ui';

import { useAppUpdate } from '@features/settings/hooks/useAppUpdate';
import { AcknowledgementsDialog } from './AcknowledgementsDialog';
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
  afterRecording: 'Transcribe After Recording also writes the summary.',
  setup: 'Run Setup Again shows the first-run steps, including choosing your AI.',
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

  const appUpdate = useAppUpdate();
  const [acknowledgementsOpen, setAcknowledgementsOpen] = useState(false);

  const { appVersion } = useSystemInfo();

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
    <SettingsPage title="General">
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
          footer={[TRANSCRIPTION_CONFIG.liveCopy.description, liveLine, FOOTER.afterRecording].filter(Boolean).join(' ')}
        >
          <CardRow
            title="Real-time Transcription"
            actions={
              <Switch
                checked={!!settings.liveTranscription}
                onCheckedChange={(checked) => setSettings({ liveTranscription: checked })}
                aria-label="Real-time transcription"
              />
            }
          />
          <CardRow
            title="Transcribe After Recording"
            actions={
              <Switch
                checked={!!settings.autoTranscribe}
                onCheckedChange={(checked) => setSettings({ autoTranscribe: checked })}
                aria-label="Transcribe after recording"
              />
            }
          />
        </Section>
      )}

      {/* App Info & Updates */}
      <Section footer={FOOTER.setup}>
        <CardRow title="Version" actions={<VersionStatus appVersion={appVersion} checking={appUpdate.checking} onCheck={() => void appUpdate.checkNow()} />} />
        <CardRow title="Acknowledgements" onOpen={() => setAcknowledgementsOpen(true)} />
        <CardRow title="Run Setup Again" tone="accent" onPress={() => setSettings({ onboarding: { completed: false } })} />
      </Section>
      <AcknowledgementsDialog open={acknowledgementsOpen} onOpenChange={setAcknowledgementsOpen} />
    </SettingsPage>
  );
};

/** The version number and Check for Updates; the result is a toast. */
const VersionStatus: React.FC<{ appVersion: string; checking: boolean; onCheck: () => void }> = ({ appVersion, checking, onCheck }) => (
  <>
    <Text variant="figure" tone="muted">{appVersion || '…'}</Text>
    {platform.hasUpdater && (
      <Button variant="outline" size="sm" onClick={onCheck} loading={checking}>Check for Updates</Button>
    )}
  </>
);

export default GeneralPanel;
