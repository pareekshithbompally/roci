/** First-run on-device option: a model for each job (chat, speech recognition, read aloud, summaries), each downloaded on
 *  this screen, in three states. Choosing: each row's picker with its download beside it; Download and Start makes the picks
 *  the defaults and downloads what is missing (Back leaves the settings as they were). Downloading: each row's progress; the
 *  app can open now while they carry on. Ready: every row ticked; Start Using Roci opens the app. */

import React, { useState } from 'react';
import { Section, WelcomeStep } from '@shared/ui';
import { JOB_GLYPH, ModelDownloadButton } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { formatFileSize } from '@shared/utils/formatters';
import type { ModelChoice } from '@shared/utils/modelResolver';
import type { AppSettings } from '@shared/types';
import type { LocalModel, LocalModelKind } from '@services/localModels.service';
import { CapabilityRow, ModelSelect, useLocalModelControls } from '@features/settings';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.setup.onDevice;
const ACTIONS = ONBOARDING_CONFIG.actions;
const JOBS = DEFAULT_MODELS_CONFIG.jobs;
const SAME_AS_CHAT = DEFAULT_MODELS_CONFIG.chatExtras.sameAsChat;
const ON_DEVICE = LOCAL_MODELS_CONFIG.provider.id;

/** Each job's model on this device, by id; `summaries` null runs summaries on the chat model. */
interface Picks {
  chat?: string;
  speech?: string;
  voice?: string;
  summaries: string | null;
}

const firstOf = (models: LocalModel[], kind: LocalModelKind) => models.find((m) => m.kind === kind)?.id;

/** A job's models on this device, each with its size; all selectable, as their downloads run on this screen. */
const choicesOf = (models: LocalModel[], kind: LocalModelKind): ModelChoice[] =>
  models.filter((m) => m.kind === kind).map((m) => ({
    value: m.id, provider: ON_DEVICE, modelId: m.id, label: m.name, ready: true, hint: formatFileSize(m.bytes),
  }));

/** The picks as the defaults Settings › Default Models shows. */
const settingsOf = (picks: Picks): Partial<AppSettings> => ({
  chatModel: picks.chat,
  analyzeModel: picks.summaries ?? undefined,
  transcriptionProvider: ON_DEVICE,
  transcriptionModel: picks.speech,
  readAloudEngine: picks.voice,
  readAloudVoice: undefined,
});

type Phase = 'choosing' | 'downloading' | 'ready';

/** The picked models (each once), those still to download, what is left of them, how far they have come together, and the
 *  screen's state: ready once all are downloaded, downloading once any is under way (or Start was pressed). */
function useChosen(models: LocalModel[], picks: Picks, started: boolean) {
  const controls = useLocalModelControls();
  const ids = new Set([picks.chat, picks.speech, picks.voice, picks.summaries].filter((id): id is string => !!id));
  const chosen = models.filter((m) => ids.has(m.id));
  const pending = chosen.filter((m) => !m.installed);
  const bytes = pending.reduce((sum, m) => sum + m.bytes, 0);
  const done = pending.reduce((sum, m) => sum + m.bytes * ((controls[m.id]?.percent ?? 0) / 100), 0);
  const busy = started || pending.some((m) => controls[m.id]?.status === 'busy');
  const phase: Phase = chosen.length > 0 && pending.length === 0 ? 'ready' : busy ? 'downloading' : 'choosing';
  return { controls, pending, bytes, left: bytes - done, percent: bytes > 0 ? Math.floor((done / bytes) * 100) : 100, phase };
}

export const OnDeviceSetup: React.FC = () => {
  const { setSettings } = useSettings();
  const finish = useFinishOnboarding();
  const setStep = useSetOnboardingStep();
  const [picked, setPicked] = useState<Partial<Picks>>({});
  const [started, setStarted] = useState(false);
  const { data: models = [] } = useLocalModels();
  const picks: Picks = {
    chat: picked.chat ?? firstOf(models, 'chat'),
    speech: picked.speech ?? firstOf(models, 'speech'),
    voice: picked.voice ?? firstOf(models, 'voice'),
    summaries: picked.summaries ?? null,
  };
  const { controls, pending, bytes, left, percent, phase } = useChosen(models, picks, started);
  const pick = (job: keyof Picks) => (id: string) => setPicked((now) => ({ ...now, [job]: id === SAME_AS_CHAT.value ? null : id }));

  // the picks become the defaults, and what isn't downloaded yet starts downloading
  const start = () => {
    setSettings(settingsOf(picks));
    pending.forEach((m) => controls[m.id]?.status === 'idle' && controls[m.id].download());
    setStarted(true);
  };
  const open = () => {
    if (!started) setSettings(settingsOf(picks));
    finish();
  };

  /** A job's row: its download (a ring while it runs, a tick once ready) beside the picker at the row's end. */
  const row = (job: keyof Picks, title: { title: string }, icon: keyof typeof JOB_GLYPH, kind: LocalModelKind) => {
    const value = picks[job] ?? undefined;
    const control = value ? controls[value] : undefined;
    return (
      <CapabilityRow icon={JOB_GLYPH[icon]} job={title}>
        <div className="flex items-center gap-2">
          {control && <ModelDownloadButton model={control} compact />}
          <ModelSelect
            value={value ?? (job === 'summaries' ? SAME_AS_CHAT.value : undefined)}
            choices={choicesOf(models, kind)}
            onChange={pick(job)}
            off={job === 'summaries' ? SAME_AS_CHAT : undefined}
          />
        </div>
      </CapabilityRow>
    );
  };

  const footer = { choosing: COPY.footer.choosing(formatFileSize(bytes)), downloading: COPY.footer.downloading(formatFileSize(left)), ready: COPY.footer.ready }[phase];
  const primary = {
    choosing: { label: COPY.start, onClick: start, disabled: models.length === 0 },
    downloading: { label: COPY.downloading(percent), onClick: start, disabled: true },
    ready: { label: COPY.ready, onClick: open },
  }[phase];
  const secondary = { choosing: { label: ACTIONS.back, onClick: () => setStep('setup') }, downloading: { label: COPY.openNow, onClick: open }, ready: undefined }[phase];

  return (
    <WelcomeStep title={COPY.heading} subtitle={COPY.subtitle} primary={primary} secondary={secondary}>
      <Section footer={footer}>
        {row('chat', JOBS.chat, 'chat', 'chat')}
        {row('speech', JOBS.transcription, 'transcription', 'speech')}
        {row('voice', JOBS.readAloud, 'readAloud', 'voice')}
        {row('summaries', JOBS.summaries, 'summaries', 'chat')}
      </Section>
    </WelcomeStep>
  );
};
