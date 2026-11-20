/** Usage marks: each feature's, metric's and highlight's glyph, and every subject's title, defined once. */

import {
  ArrowDownToLine, ArrowUpToLine, CircleDollarSign, Coins, Crown, Database, Lightbulb, Minus, PencilLine, Send, Sparkles, Sun,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import type { TileGlyph } from '@shared/ui';
import { JOB_GLYPH } from '@shared/components';
import { USAGE_CONFIG, type UsageMetric } from '@config/usage.config';
import type { UsageCategory } from '@extensions/usage';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { modelName, type UsageSubject } from '@features/usage/model/subject';

/** Each feature's name, glyph and hue (hue from its modality, as in Default Models). */
export const CATEGORY_MARK: Record<UsageCategory, { label: string; icon: TileGlyph }> = {
  chat: { label: 'Chat', icon: JOB_GLYPH.chat },
  suggestions: { label: 'Suggestions', icon: Lightbulb },
  'title-gen': { label: 'Chat titles', icon: PencilLine },
  summary: { label: 'Summaries', icon: JOB_GLYPH.summaries },
  liveNotes: { label: 'Live notes', icon: JOB_GLYPH.summaries },
  transcription: { label: 'Transcription', icon: JOB_GLYPH.transcription },
};

/** A recorded category's mark; one the app doesn't name still shows under its raw name, so every list adds up. */
export function categoryMark(category: string): { label: string; icon: TileGlyph } {
  return CATEGORY_MARK[category as UsageCategory] ?? { label: category, icon: Sparkles };
}

/** Totals and highlights: their glyphs on activity tiles. */
export const USAGE_GLYPH = {
  input: ArrowDownToLine,
  output: ArrowUpToLine,
  cached: Database,
  average: Sun,
  peak: Crown,
} as const satisfies Record<string, TileGlyph>;

/** Each metric's own glyph (history rows, totals). */
export const METRIC_GLYPH: Record<UsageMetric, TileGlyph> = {
  cost: CircleDollarSign,
  requests: Send,
  tokens: Coins,
};

/** Up, down or flat against the previous period. */
export function changeGlyph(ratio: number): TileGlyph {
  if (ratio > 0) return TrendingUp;
  if (ratio < 0) return TrendingDown;
  return Minus;
}

/** A page's title: the provider's or model's name, the feature's label, "Model Prices", or "All usage". */
export function subjectTitle(subject: UsageSubject): string {
  if (subject.kind === 'provider') return getProviderTitle(subject.provider);
  if (subject.kind === 'model') return modelName(subject.model);
  if (subject.kind === 'feature') return categoryMark(subject.category).label;
  if (subject.kind === 'prices') return USAGE_CONFIG.copy.prices.title;
  return USAGE_CONFIG.copy.allTitle;
}
