/** The defaults a provider offers, read-only: one row per job with its model's name. Setup and Settings › Default Models. */

import React, { useCallback } from 'react';
import { Section, Text } from '@shared/ui';
import { JOB_GLYPH } from '@shared/components';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { isAppleSpeech } from '@services/ai/models';
import type { ModelRef, SetupDefaults } from '@services/ai/models';
import { modalitiesService } from '@services/modalities';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { CapabilityRow } from './shared';

const COPY = ONBOARDING_CONFIG.setup.defaults;
const JOBS = DEFAULT_MODELS_CONFIG.jobs;

/** A model's name: this device's catalog, Apple's own, models.dev, then the name it's saved under; its id when none has it. */
export function useModelName(): (ref: ModelRef | null, none: string) => string {
  const { data: localModels = [] } = useLocalModels();
  const { providers } = useSettings();
  return useCallback((ref, none) => {
    if (!ref) return none;
    if (isAppleSpeech(ref)) return TRANSCRIPTION_CONFIG.appleSpeech.label;
    if (ref.provider === APPLE_INTELLIGENCE.provider) return APPLE_INTELLIGENCE.name;
    const saved = providers.find((p) => p.provider === ref.provider)?.models?.find((m) => m.id === ref.model);
    return localModels.find((m) => m.id === ref.model)?.name
      ?? modalitiesService.catalogName(ref.provider, ref.model)
      ?? (saved ? getModelDisplayName(saved) : ref.model);
  }, [localModels, providers]);
}

/** Every model a set uses, each once, in job order: "GPT-6 Luna, GPT-4o mini Transcribe, GPT-4o mini TTS". */
export function useModelsLine(): (defaults: SetupDefaults) => string {
  const nameOf = useModelName();
  return useCallback((defaults) => {
    const refs = [defaults.chat, defaults.transcription, defaults.readAloud, defaults.images].filter((ref): ref is ModelRef => !!ref);
    return [...new Set(refs.map((ref) => nameOf(ref, '')))].join(', ');
  }, [nameOf]);
}

interface DefaultsListProps {
  defaults: SetupDefaults;
  /** What the choice itself has to say (a download's size); otherwise where to change them. */
  footer?: string;
}

export const DefaultsList: React.FC<DefaultsListProps> = ({ defaults, footer = COPY.footer }) => {
  const nameOf = useModelName();
  const rows = [
    { job: JOBS.chat, icon: JOB_GLYPH.chat, value: nameOf(defaults.chat, COPY.notSetUp) },
    { job: JOBS.summaries, icon: JOB_GLYPH.summaries, value: nameOf(defaults.chat, COPY.notSetUp) },
    { job: JOBS.transcription, icon: JOB_GLYPH.transcription, value: nameOf(defaults.transcription, COPY.notSetUp) },
    { job: JOBS.readAloud, icon: JOB_GLYPH.readAloud, value: nameOf(defaults.readAloud, COPY.deviceVoice) },
    { job: JOBS.images, icon: JOB_GLYPH.images, value: nameOf(defaults.images, COPY.off) },
  ];
  return (
    <Section title={COPY.title} footer={defaults.chat ? footer : COPY.noChat}>
      {rows.map(({ job, icon, value }) => (
        <CapabilityRow key={job.title} icon={icon} job={job}><Text tone="muted" truncate>{value}</Text></CapabilityRow>
      ))}
    </Section>
  );
};
