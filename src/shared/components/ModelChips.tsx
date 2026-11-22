/** A model's facts as chips (what it can take and do), and its name with them: one look for every model list. */

import React from 'react';
import { AudioLines, Brain, Eye, FileText, Video, Wrench, type LucideIcon } from 'lucide-react';
import { Chip } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import { featuresOf } from '@services/ai/models';
import { MODEL_MENU_COPY } from '@config/modelMenu.config';
import type { ModelFeature, ModelProfile } from '@services/ai/models';

/** Each feature's chip glyph (text in and out is a given, so not shown); its title is the feature's name. */
const FEATURE_ICONS: Readonly<Record<ModelFeature, LucideIcon>> = {
  vision: Eye, audio: AudioLines, video: Video, pdf: FileText, tools: Wrench, thinking: Brain,
};

/** A guessed feature says so on hover. */
const GUESSED_SUFFIX = ' (estimated)';

export interface ModelChipsProps {
  /** What the model takes and can do; null while unknown. */
  profile?: ModelProfile | null;
}

export const ModelChips: React.FC<ModelChipsProps> = ({ profile }) => {
  const features = profile ? featuresOf(profile) : [];
  if (features.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {features.map(({ feature, guessed }) => {
        const icon = FEATURE_ICONS[feature];
        const title = MODEL_MENU_COPY.features[feature];
        return <Chip key={feature} icon={icon} title={guessed ? `${title}${GUESSED_SUFFIX}` : title} estimated={guessed} />;
      })}
    </span>
  );
};

export interface ModelLabelProps extends ModelChipsProps {
  name: string;
}

/** A model's name and its chips: beside the name on a Mac, under it on a phone (a phone row is too narrow for both). */
export const ModelLabel: React.FC<ModelLabelProps> = ({ name, ...chips }) => {
  const phone = useFormFactor() === 'phone';
  return (
    <span className={phone ? 'flex min-w-0 flex-col items-start gap-1' : 'flex min-w-0 items-center gap-2'}>
      <span className="min-w-0 truncate">{name}</span>
      <ModelChips {...chips} />
    </span>
  );
};
