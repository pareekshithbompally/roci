/** Usage marks: each feature's, metric's and highlight's glyph, and every subject's title and tint, defined once. */

import {
  ArrowLineDownIcon, ArrowLineUpIcon, CoinsIcon, CrownSimpleIcon, CurrencyCircleDollarIcon, DatabaseIcon, LightbulbIcon, MinusIcon,
  PaperPlaneTiltIcon, PencilSimpleLineIcon, SparkleIcon, SunIcon, TrendDownIcon, TrendUpIcon,
} from '@phosphor-icons/react';
import type { TileGlyph } from '@shared/ui';
import { JOB_GLYPH } from '@shared/components';
import { TILE_DOMAIN, type TileTint } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMetric } from '@config/usage.config';
import type { UsageCategory } from '@extensions/usage';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { modelName, type UsageSubject } from '@features/usage/model/subject';

/** Each feature's name, glyph and hue (hue from its modality, as in Capabilities). */
export const CATEGORY_MARK: Record<UsageCategory, { label: string; icon: TileGlyph; tint: TileTint }> = {
  chat: { label: 'Chat', icon: JOB_GLYPH.chat, tint: TILE_DOMAIN.text },
  suggestions: { label: 'Suggestions', icon: LightbulbIcon, tint: TILE_DOMAIN.text },
  'title-gen': { label: 'Chat titles', icon: PencilSimpleLineIcon, tint: TILE_DOMAIN.text },
  summary: { label: 'Summaries', icon: JOB_GLYPH.summaries, tint: TILE_DOMAIN.meetings },
  transcription: { label: 'Transcription', icon: JOB_GLYPH.transcription, tint: TILE_DOMAIN.speech },
};

/** A recorded category's mark; one the app doesn't name still shows under its raw name, so every list adds up. */
export function categoryMark(category: string): { label: string; icon: TileGlyph; tint: TileTint } {
  return CATEGORY_MARK[category as UsageCategory] ?? { label: category, icon: SparkleIcon, tint: TILE_DOMAIN.system };
}

/** Totals and highlights: their glyphs on activity tiles. */
export const USAGE_GLYPH = {
  input: ArrowLineDownIcon,
  output: ArrowLineUpIcon,
  cached: DatabaseIcon,
  average: SunIcon,
  peak: CrownSimpleIcon,
} as const satisfies Record<string, TileGlyph>;

/** Each metric's own glyph (history rows, totals). */
export const METRIC_GLYPH: Record<UsageMetric, TileGlyph> = {
  cost: CurrencyCircleDollarIcon,
  requests: PaperPlaneTiltIcon,
  tokens: CoinsIcon,
};

/** Up, down or flat against the previous period. */
export function changeGlyph(ratio: number): TileGlyph {
  if (ratio > 0) return TrendUpIcon;
  if (ratio < 0) return TrendDownIcon;
  return MinusIcon;
}

/** A page's title: the provider's or model's name, the feature's label, or "All usage". */
export function subjectTitle(subject: UsageSubject): string {
  if (subject.kind === 'provider') return getProviderTitle(subject.provider);
  if (subject.kind === 'model') return modelName(subject.model);
  if (subject.kind === 'feature') return categoryMark(subject.category).label;
  return USAGE_CONFIG.copy.allTitle;
}

/** A page's chart hue: the tile colour of what it is about. */
export function subjectTint(subject: UsageSubject): TileTint {
  if (subject.kind === 'feature') return categoryMark(subject.category).tint;
  if (subject.kind === 'all') return TILE_DOMAIN.activity;
  return TILE_DOMAIN.intelligence;
}
