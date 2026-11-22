/** Headline figures `show` drew: kit stat cards side by side (as Usage shows its totals), their source under them. */

import React from 'react';
import { Section, StatCard } from '@shared/ui';
import type { ResultView } from '@core/ai';
import { SourceLine } from './SourceLine';

type StatsViewModel = Extract<ResultView, { kind: 'stats' }>;

export const StatsView: React.FC<{ view: StatsViewModel }> = ({ view }) => (
  <Section title={view.title} layout="stack" footer={<SourceLine source={view.source} asOf={view.asOf} />}>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {view.stats.map((stat, i) => <StatCard key={`${i}-${stat.label}`} label={stat.label} value={stat.value} detail={stat.change} />)}
    </div>
  </Section>
);
