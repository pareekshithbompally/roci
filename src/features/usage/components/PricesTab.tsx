/** Usage › Prices: one table of the models worth a price, with the price that applies and where it comes from; type a rate
 *  to use your own (it also prices that model's earlier calls), clear it to go back to models.dev's. */

import React, { useState } from 'react';
import { DataTable, ICON_TILE_PX, Input, Section, Text, type DataColumn } from '@shared/ui';
import { ModelIcon } from '@shared/components';
import { USAGE_CONFIG } from '@config/usage.config';
import { getModelDisplayName, getProviderTitle } from '@shared/utils/provider.utils';
import type { ModelPrice } from '@shared/types/modelProviders';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { parsePrice, type PriceRow } from '@features/usage/model/prices';
import { modelName } from '@features/usage/model/series';

const COPY = USAGE_CONFIG.copy.prices;
type Rate = keyof Pick<ModelPrice, 'inputPer1M' | 'outputPer1M'>;
type SavePrice = (row: PriceRow, price: ModelPrice | null) => void;

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** One rate: your price, models.dev's as the placeholder. Leaving the field saves it with the other rate as it stands
 *  (yours, else models.dev's); emptying it clears your price. Free and unsaved models show their rate as text. */
const RateField: React.FC<{ row: PriceRow; rate: Rate; onSave: SavePrice }> = ({ row, rate, onSave }) => {
  const [text, setText] = useState(rateText(row.own?.[rate]));
  if (row.source === 'free') return <Text variant="figure" tone="muted">0</Text>;
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
    <Input
      className="w-24 text-right"
      inputMode="decimal"
      aria-label={`${COPY[rate === 'inputPer1M' ? 'input' : 'output']} — ${modelName(row.modelId)}`}
      placeholder={rateText(row.catalog?.[rate])}
      disabled={!row.model}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
    />
  );
};

const columns = (onSave: SavePrice): ReadonlyArray<DataColumn<PriceRow>> => [
  {
    key: 'model',
    header: COPY.model,
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        <ModelIcon provider={row.provider} modelId={row.modelId} size={ICON_TILE_PX} />
        <Text truncate>{row.model ? getModelDisplayName(row.model) : modelName(row.modelId)}</Text>
      </div>
    ),
  },
  { key: 'provider', header: COPY.provider, cell: (row) => <Text tone="muted">{getProviderTitle(row.provider)}</Text> },
  { key: 'source', header: COPY.source, cell: (row) => <Text tone={row.source === 'unknown' ? 'warning' : 'muted'}>{COPY.sources[row.source]}</Text> },
  // Keyed by the saved price, so a field shows it again after a save elsewhere (a row re-read).
  { key: 'input', header: COPY.input, align: 'end', cell: (row) => <RateField key={rateText(row.own?.inputPer1M)} row={row} rate="inputPer1M" onSave={onSave} /> },
  { key: 'output', header: COPY.output, align: 'end', cell: (row) => <RateField key={rateText(row.own?.outputPer1M)} row={row} rate="outputPer1M" onSave={onSave} /> },
];

export const PricesTab: React.FC = () => {
  const { rows, setPrice } = usePriceRows();
  if (rows.length === 0) return <Text as="p" tone="muted" className="py-12 text-center">{COPY.none}</Text>;
  return (
    <Section layout="stack" footer={COPY.footer}>
      <DataTable
        columns={columns((row, price) => setPrice(row.provider, row.modelId, price))}
        rows={rows}
        rowKey={(row) => `${row.provider}/${row.modelId}`}
        label={COPY.label}
      />
    </Section>
  );
};
