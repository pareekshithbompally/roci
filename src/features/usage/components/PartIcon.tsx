/** A usage part's icon: a model's (its maker, else its provider), or a use case's glyph as Default Models shows it. */

import React from 'react';
import { Sparkles, type LucideIcon } from 'lucide-react';
import { Icon } from '@shared/ui';
import { JOB_GLYPH, ModelIcon } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import type { PartMark } from '@features/usage/model/series';

/** Each use case's glyph; one the app doesn't name gets a generic one. */
const USE_CASE_GLYPH: Record<string, LucideIcon> = {
  chat: JOB_GLYPH.chat,
  image: JOB_GLYPH.images,
  summary: JOB_GLYPH.summaries,
  transcription: JOB_GLYPH.transcription,
};

export const PartIcon: React.FC<{ mark: PartMark }> = ({ mark }) =>
  mark.kind === 'useCase'
    ? <Icon icon={USE_CASE_GLYPH[mark.category] ?? Sparkles} size="sm" />
    : <ModelIcon provider={mark.provider} modelId={mark.model} size={UI_CONFIG.chart.rowIcon} />;
