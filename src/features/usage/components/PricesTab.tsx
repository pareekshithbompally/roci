/** Usage › Prices: one table of the models worth a price, with the price that applies and where it comes from; type a rate
 *  to use your own (it also prices that model's earlier calls), clear it to go back to models.dev's. */

import React, { useMemo, useState } from 'react';
import { ChartPie } from 'lucide-react';
import { DataTable, Input, Section, Tabs, Text, type DataColumn } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { ModelIcon } from '@shared/components';
import { USAGE_CONFIG, type PriceScope } from '@config/usage.config';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import type { ModelPrice } from '@shared/types/modelProviders';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { parsePrice, type PriceRow } from '@features/usage/model/prices';
import { modelName, providerName } from '@features/usage/model/series';

const COPY = USAGE_CONFIG.copy.prices;
type Rate = keyof Pick<ModelPrice, 'inputPer1M' | 'outputPer1M'>;
type SavePrice = (row: PriceRow, price: ModelPrice | null) => void;

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** One rate: your price, models.dev's as the placeholder. Leaving the field saves it with the other rate as it stands
 *  (yours, else models.dev's); emptying it clears your price. Free and unsaved models show their rate as text. */
const RateField: React.FC<{ row: PriceRow; rate: Rate; onSave: SavePrice }> = ({ row, rate, onSave }) => {
  const [text, setText] = useState(rateText(row.own?.[rate]));
  if (row.source === 'free') return <Text variant="figure" tone="muted">—</Text>;
  const other: Rate = rate === 'inputPer1M' ? 'outputPer1M' : 'inputPer1M';
  const save = () => {
    if (!text.trim()) {
      if (row.own) onSave(row, null);
      return;
    }
    const otherText = rateText(row.own?.[other] ?? row.catalog?.[other]);
    const price = rate === 'inputPer1M' ? parsePrice(text, otherText) : parsePrice(otherText, text);
    if (price) onSave(row, price);
  };
  return (
    // A field a fixed width at the cell's end, as a column of figures lines up.
    <div className="ml-auto w-24">
      <Input
        size="sm"
        className="text-right"
        inputMode="decimal"
        aria-label={`${COPY[rate === 'inputPer1M' ? 'input' : 'output']} — ${modelName(row.modelId)}`}
        placeholder={rateText(row.catalog?.[rate])}
        disabled={!row.model}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </div>
  );
};

/** The rows a scope shows: all, those with no price, or those you priced. */
const inScope = (scope: PriceScope) => (row: PriceRow) =>
  scope === 'all' || (scope === 'unknown' ? row.source === 'unknown' : row.source === 'own');

const columns = (onSave: SavePrice): ReadonlyArray<DataColumn<PriceRow>> => [
  {
    key: 'model',
    header: COPY.model,
    sortValue: (row) => modelName(row.modelId),
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        <ModelIcon provider={row.provider} modelId={row.modelId} size={UI_CONFIG.chart.rowIcon} />
        <Text truncate>{row.model ? getModelDisplayName(row.model) : modelName(row.modelId)}</Text>
      </div>
    ),
  },
  { key: 'provider', header: COPY.provider, sortValue: (row) => providerName(row.provider), cell: (row) => <Text tone="muted" truncate>{providerName(row.provider)}</Text> },
  {
    key: 'source',
    header: COPY.source,
    sortValue: (row) => COPY.sources[row.source],
    cell: (row) => <Text tone={row.source === 'unknown' ? 'warning' : 'muted'}>{COPY.sources[row.source]}</Text>,
  },
  // Keyed by the saved price, so a field shows it again after a save elsewhere (a row re-read).
  { key: 'input', header: COPY.input, align: 'end', cell: (row) => <RateField key={rateText(row.own?.inputPer1M)} row={row} rate="inputPer1M" onSave={onSave} /> },
  { key: 'output', header: COPY.output, align: 'end', cell: (row) => <RateField key={rateText(row.own?.outputPer1M)} row={row} rate="outputPer1M" onSave={onSave} /> },
];

export const PricesTab: React.FC = () => {
  const { rows, setPrice } = usePriceRows();
  const [scope, setScope] = useState<PriceScope>('all');
  const table = useMemo(() => columns((row, price) => setPrice(row.provider, row.modelId, price)), [setPrice]);
  const shown = useMemo(() => rows.filter(inScope(scope)), [rows, scope]);
  if (rows.length === 0) return <EmptyState icon={ChartPie} message={COPY.none} />;
  return (
    <Section layout="stack" footer={COPY.footer}>
      <DataTable
        columns={table}
        rows={shown}
        rowKey={(row) => `${row.provider}/${row.modelId}`}
        label={COPY.label}
        search={{ placeholder: USAGE_CONFIG.copy.search.prices, text: (row) => `${row.modelId} ${providerName(row.provider)}` }}
        accessory={<Tabs items={COPY.scopes} value={scope} onValueChange={setScope} label={COPY.scopeLabel} />}
        empty={USAGE_CONFIG.copy.noMatches}
      />
    </Section>
  );
};
