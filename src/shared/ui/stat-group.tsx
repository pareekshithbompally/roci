/** Key figures, one description for both form factors: cards on a Mac, a card of rows on iPhone (the value at the end). */

import { useFormFactor } from '@platform/formFactor';
import { CardRow, Section } from './card';
import { StatCard, type StatCardProps } from './stat-card';

export interface StatGroupProps {
  /** The rows' heading (iPhone); none when the group around it names them. */
  title?: string;
  stats: readonly StatCardProps[];
}

export function StatGroup({ title, stats }: StatGroupProps) {
  if (useFormFactor() === 'phone') {
    return (
      <Section title={title}>
        {stats.map(({ label, value, detail }) => (
          <CardRow key={label} title={label} description={detail} value={value} />
        ))}
      </Section>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
    </div>
  );
}
