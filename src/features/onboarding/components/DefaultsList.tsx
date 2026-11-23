/** The defaults a detected provider offers, read-only: one row per job. */

import React from 'react';
import { Section, Text } from '@shared/ui';
import { JOB_GLYPH } from '@shared/components';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { CapabilityRow } from '@features/settings';
import { isAppleSpeech } from '@services/ai/models';
import type { ModelRef, SetupDefaults } from '@services/ai/models';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

const COPY = ONBOARDING_CONFIG.setup.defaults;
const JOBS = DEFAULT_MODELS_CONFIG.jobs;

function useModelName(): (ref: ModelRef | null, none: string) => string {
  const { data: localModels = [] } = useLocalModels();
  return (ref, none) => {
    if (!ref) return none;
    if (isAppleSpeech(ref)) return TRANSCRIPTION_CONFIG.appleSpeech.label;
    if (ref.provider === APPLE_INTELLIGENCE.provider) return APPLE_INTELLIGENCE.name;
    return localModels.find((m) => m.id === ref.model)?.name ?? ref.model;
  };
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
