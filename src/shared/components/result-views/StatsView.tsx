/** Headline figures `show` drew: the kit's key figures (cards on a Mac, rows on iPhone, as Usage shows its totals), their
 *  source under them. */

import React from 'react';
import { Section, StatGroup } from '@shared/ui';
import type { ResultView } from '@core/ai';
import { SourceLine } from './SourceLine';

type StatsViewModel = Extract<ResultView, { kind: 'stats' }>;

export const StatsView: React.FC<{ view: StatsViewModel }> = ({ view }) => (
  <Section title={view.title} layout="stack" footer={<SourceLine source={view.source} asOf={view.asOf} />}>
    <StatGroup stats={view.stats.map((stat) => ({ label: stat.label, value: stat.value, detail: stat.change }))} />
  </Section>
);
