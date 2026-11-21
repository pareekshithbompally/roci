/** Usage › Prices: one table of the models worth a price, with the price that applies and where it comes from; type a rate
 *  to use your own (it also prices that model's earlier calls), clear it to go back to models.dev's. */

import React, { useMemo, useState } from 'react';
import { ChartPie } from 'lucide-react';
import { DataTable, Input, Section, Tabs, Text, type DataColumn } from '@shared/ui';
import { ScreenState } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { ModelIcon } from '@shared/components';
import { USAGE_CONFIG, type PriceScope } from '@config/usage.config';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import type { ModelPrice } from '@shared/types/modelProviders';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { parsePrice, type PriceRow, type PriceText } from '@features/usage/model/prices';
import { modelName, providerName } from '@features/usage/model/series';

const COPY = USAGE_CONFIG.copy.prices;
type Rate = keyof Required<ModelPrice>;
const RATES: readonly Rate[] = ['inputPer1M', 'outputPer1M', 'perMinute'];
const RATE_LABEL: Record<Rate, string> = { inputPer1M: COPY.input, outputPer1M: COPY.output, perMinute: COPY.perMinute };
type SavePrice = (row: PriceRow, price: ModelPrice | null) => void;

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** One rate: your price, models.dev's as the placeholder. Leaving the field saves it with the other rates as they stand
 *  (yours, else models.dev's). Emptying a token rate drops the token pair, emptying the per-minute rate drops it; with no rate
 *  left your price is cleared. Free models show a dash. */
const RateField: React.FC<{ row: PriceRow; rate: Rate; onSave: SavePrice }> = ({ row, rate, onSave }) => {
  const [text, setText] = useState(rateText(row.own?.[rate]));
  if (row.source === 'free') return <Text variant="figure" tone="muted">—</Text>;
  const save = () => {
    const cleared = !text.trim();
    const pair = (r: Rate) => r !== 'perMinute' && rate !== 'perMinute';
    // a price saved only for its per-minute rate holds 0 token rates just to be a price: clearing that rate clears it all
    const perMinuteOnly = row.own?.perMinute !== undefined && !row.own.inputPer1M && !row.own.outputPer1M;
    const clearsAll = cleared && rate === 'perMinute' && perMinuteOnly;
    const keep = (r: Rate) => (clearsAll ? '' : rateText(cleared ? row.own?.[r] : row.own?.[r] ?? row.catalog?.[r]));
    const typed = Object.fromEntries(RATES.map((r) => [r, r === rate || (cleared && pair(r)) ? text : keep(r)])) as PriceText;
    const price = parsePrice(typed);
    if (price !== undefined && (price || row.own)) onSave(row, price);
  };
  return (
    // A field a fixed width at the cell's end, as a column of figures lines up.
    <div className="ml-auto w-24">
      <Input
        size="sm"
        className="text-right"
        inputMode="decimal"
        aria-label={`${RATE_LABEL[rate]} — ${modelName(row.modelId)}`}
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
  { key: 'perMinute', header: COPY.perMinute, align: 'end', cell: (row) => <RateField key={rateText(row.own?.perMinute)} row={row} rate="perMinute" onSave={onSave} /> },
];

export const PricesTab: React.FC = () => {
  const { rows, setPrice, isLoading } = usePriceRows();
  const [scope, setScope] = useState<PriceScope>('all');
  const table = useMemo(() => columns((row, price) => setPrice(row.provider, row.modelId, price)), [setPrice]);
  const shown = useMemo(() => rows.filter(inScope(scope)), [rows, scope]);
  return (
    <ScreenState loading={isLoading} empty={rows.length === 0 && { icon: ChartPie, message: COPY.none }}>
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
    </ScreenState>
  );
};
