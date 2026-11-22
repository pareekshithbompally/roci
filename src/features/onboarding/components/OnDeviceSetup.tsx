/** First-run on-device option: a model for each job (chat, speech recognition, read aloud, summaries), each downloaded on
 *  this screen. The picks become the defaults when the downloads start: Start waits for them and opens the app; Set up
 *  later opens it at once while they carry on (the activity tray shows them). Back leaves the settings as they were. */

import React, { useEffect, useState } from 'react';
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

/** The picked models (each once), those still to download, their size, and how far they have come together. */
function useChosen(models: LocalModel[], picks: Picks) {
  const controls = useLocalModelControls();
  const ids = new Set([picks.chat, picks.speech, picks.voice, picks.summaries].filter((id): id is string => !!id));
  const chosen = models.filter((m) => ids.has(m.id));
  const pending = chosen.filter((m) => !m.installed);
  const bytes = pending.reduce((sum, m) => sum + m.bytes, 0);
  const done = pending.reduce((sum, m) => sum + m.bytes * ((controls[m.id]?.percent ?? 0) / 100), 0);
  return { controls, chosen, pending, bytes, percent: bytes > 0 ? Math.floor((done / bytes) * 100) : 100 };
}

export const OnDeviceSetup: React.FC = () => {
  const { setSettings } = useSettings();
  const finish = useFinishOnboarding();
  const setStep = useSetOnboardingStep();
  const [picked, setPicked] = useState<Partial<Picks>>({});
  const [starting, setStarting] = useState(false);
  const { data: models = [] } = useLocalModels();
  const picks: Picks = {
    chat: picked.chat ?? firstOf(models, 'chat'),
    speech: picked.speech ?? firstOf(models, 'speech'),
    voice: picked.voice ?? firstOf(models, 'voice'),
    summaries: picked.summaries ?? null,
  };
  const { controls, chosen, pending, bytes, percent } = useChosen(models, picks);
  const pick = (job: keyof Picks) => (id: string) => setPicked((now) => ({ ...now, [job]: id === SAME_AS_CHAT.value ? null : id }));

  // the picks become the defaults, and what isn't downloaded yet starts downloading
  const apply = () => {
    setSettings(settingsOf(picks));
    pending.forEach((m) => controls[m.id]?.status === 'idle' && controls[m.id].download());
  };

  // Start waits here until every picked model is downloaded
  useEffect(() => {
    if (starting && chosen.length > 0 && pending.length === 0) finish();
  }, [starting, chosen.length, pending.length, finish]);

  const row = (job: keyof Picks, title: { title: string }, icon: keyof typeof JOB_GLYPH, kind: LocalModelKind) => {
    const value = picks[job] ?? undefined;
    const control = value ? controls[value] : undefined;
    return (
      <CapabilityRow icon={JOB_GLYPH[icon]} job={title}>
        <div className="flex items-center gap-2">
          <ModelSelect
            value={value ?? (job === 'summaries' ? SAME_AS_CHAT.value : undefined)}
            choices={choicesOf(models, kind)}
            onChange={pick(job)}
            off={job === 'summaries' ? SAME_AS_CHAT : undefined}
          />
          {control && <ModelDownloadButton model={control} />}
        </div>
      </CapabilityRow>
    );
  };

  const start = () => {
    apply();
    setStarting(true);
  };
  const later = () => {
    apply();
    finish();
  };
  const primaryLabel = pending.length === 0 ? COPY.startReady : starting ? COPY.downloading(percent) : COPY.start;

  return (
    <WelcomeStep
      title={COPY.heading}
      subtitle={COPY.subtitle}
      primary={{ label: primaryLabel, onClick: start, disabled: starting || chosen.length === 0 }}
      // once the downloads run, the way out is to let them carry on; before, it is back to the choices
      secondary={starting ? { label: ACTIONS.later, onClick: later } : { label: ACTIONS.back, onClick: () => setStep('setup') }}
    >
      <Section footer={bytes > 0 ? COPY.footer(formatFileSize(bytes)) : COPY.ready}>
        {row('chat', JOBS.chat, 'chat', 'chat')}
        {row('speech', JOBS.transcription, 'transcription', 'speech')}
        {row('voice', JOBS.readAloud, 'readAloud', 'voice')}
        {row('summaries', JOBS.summaries, 'summaries', 'chat')}
      </Section>
    </WelcomeStep>
  );
};
