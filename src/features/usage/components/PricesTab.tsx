/** Usage › Prices: the models worth a price, with the price that applies and where it comes from; a model's price form sets
 *  your own (it also prices that model's earlier calls) or goes back to models.dev's. A Mac opens it from the table's Edit;
 *  iPhone from the model's row. */

import React, { useCallback, useMemo, useState } from 'react';
import { ChartPie } from 'lucide-react';
import { Button, Section, Tabs, Text, type DataColumn } from '@shared/ui';
import { FieldRow, FormDialog, ModelIcon, RecordList, ScreenState } from '@shared/components';
import { KIT_COPY } from '@config/kitCopy.config';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type PriceScope } from '@config/usage.config';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import type { ModelPrice } from '@shared/types/modelProviders';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { parsePrice, type PriceRow, type PriceText } from '@features/usage/model/prices';
import { modelName, providerName } from '@features/usage/model/series';
import { formatMeasure } from '@features/usage/model/format';
import { ModelCell } from './ModelCell';

const COPY = USAGE_CONFIG.copy.prices;
type Rate = keyof Required<ModelPrice>;
const RATES: readonly Rate[] = ['inputPer1M', 'outputPer1M', 'perMinute'];
const RATE_LABEL: Record<Rate, string> = { inputPer1M: COPY.input, outputPer1M: COPY.output, perMinute: COPY.perMinute };
type SavePrice = (row: PriceRow, price: ModelPrice | null) => void;

/** A model's name, and under it "Provider · where its price comes from". */
const priceName = (row: PriceRow) => (row.model ? getModelDisplayName(row.model) : modelName(row.modelId));
const PriceCaption: React.FC<{ row: PriceRow }> = ({ row }) => (
  <>{providerName(row.provider)} · <Text as="span" variant="caption" tone={row.source === 'unknown' ? 'warning' : 'muted'}>{COPY.sources[row.source]}</Text></>
);

/** The price that applies, as one value: "$1.25 / $10.00", or a speech model's per-minute rate. */
function priceText({ own, catalog }: PriceRow): string | undefined {
  const price = own ?? catalog;
  if (!price) return undefined;
  if (price.perMinute !== undefined && !price.inputPer1M && !price.outputPer1M) return formatMeasure('cost', price.perMinute);
  return COPY.rates(formatMeasure('cost', price.inputPer1M), formatMeasure('cost', price.outputPer1M));
}

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** One rate as it applies (yours, else models.dev's); a dash when there is none. */
const RateText: React.FC<{ row: PriceRow; rate: Rate }> = ({ row, rate }) => {
  const value = (row.own ?? row.catalog)?.[rate];
  return <Text variant="figure" tone={row.own ? 'primary' : 'muted'}>{value === undefined ? '—' : formatMeasure('cost', value)}</Text>;
};

/** The rows a scope shows: all, those with no price, or those you priced. */
const inScope = (scope: PriceScope) => (row: PriceRow) =>
  scope === 'all' || (scope === 'unknown' ? row.source === 'unknown' : row.source === 'own');

const editable = (row: PriceRow) => !!row.model && row.source !== 'free';

const columns = (onEdit: (row: PriceRow) => void): ReadonlyArray<DataColumn<PriceRow>> => [
  {
    // The model over "Provider · where its price comes from", so the rates keep the row's width.
    key: 'model',
    header: COPY.model,
    sortValue: (row) => modelName(row.modelId),
    cell: (row) => (
      <ModelCell
        provider={row.provider}
        modelId={row.modelId}
        name={priceName(row)}
        caption={<PriceCaption row={row} />}
      />
    ),
  },
  ...RATES.map((rate) => ({ key: rate, header: RATE_LABEL[rate], align: 'end' as const, cell: (row: PriceRow) => <RateText row={row} rate={rate} /> })),
  // Every rate is set together in the price form, so a pair is never half saved.
  { key: 'edit', header: '', align: 'end', cell: (row) => editable(row) && <Button variant="outline" size="sm" onClick={() => onEdit(row)}>{COPY.edit}</Button> },
];

interface PriceFormProps {
  row: PriceRow;
  onSave: SavePrice;
  onClose: () => void;
}

/** One model's price: the rates that apply, saved together as yours. */
const PriceForm: React.FC<PriceFormProps> = ({ row, onSave, onClose }) => {
  const start = useMemo(() => Object.fromEntries(RATES.map((r) => [r, rateText(row.own?.[r] ?? row.catalog?.[r])])) as PriceText, [row]);
  const [text, setText] = useState(start);
  const dirty = RATES.some((r) => text[r] !== start[r]);
  const price = parsePrice(text);
  const save = (next: ModelPrice | null) => {
    onSave(row, next);
    onClose();
  };
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={priceName(row)}
      dirty={dirty}
      submit={{ label: KIT_COPY.save, onPress: () => price !== undefined && save(price), disabled: !dirty || price === undefined }}
      aside={row.own ? { label: COPY.reset, onPress: () => save(null) } : undefined}
    >
      <Section title={COPY.group} footer={COPY.footer}>
        {RATES.map((r) => (
          <FieldRow key={r} typed kind="decimal" title={RATE_LABEL[r]} value={text[r]} placeholder={KIT_COPY.none} onChange={(value) => setText({ ...text, [r]: value })} />
        ))}
      </Section>
    </FormDialog>
  );
};

const priceKey = (row: PriceRow) => `${row.provider}/${row.modelId}`;

export const PricesTab: React.FC = () => {
  const { rows, setPrice, isLoading } = usePriceRows();
  const [scope, setScope] = useState<PriceScope>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const save = useCallback<SavePrice>((row, price) => setPrice(row.provider, row.modelId, price), [setPrice]);
  const table = useMemo(() => columns((row) => setOpenKey(priceKey(row))), []);
  const open = rows.find((row) => priceKey(row) === openKey);
  const shown = useMemo(() => rows.filter(inScope(scope)), [rows, scope]);
  return (
    <ScreenState loading={isLoading} empty={rows.length === 0 && { icon: ChartPie, message: COPY.none }}>
      <Section layout="stack" footer={COPY.footer}>
        <RecordList
          columns={table}
          rows={shown}
          rowKey={priceKey}
          label={COPY.label}
          search={{ placeholder: USAGE_CONFIG.copy.search.prices, text: (row) => `${row.modelId} ${providerName(row.provider)}` }}
          accessory={<Tabs items={COPY.scopes} value={scope} onValueChange={setScope} label={COPY.scopeLabel} />}
          empty={USAGE_CONFIG.copy.noMatches}
          phoneRow={(row) => ({
            title: priceName(row),
            description: <PriceCaption row={row} />,
            leading: <ModelIcon provider={row.provider} modelId={row.modelId} size={UI_CONFIG.chart.rowIcon} />,
            value: priceText(row),
          })}
          onOpen={(row) => setOpenKey(priceKey(row))}
          canOpen={editable}
        />
      </Section>
      {open && <PriceForm row={open} onSave={save} onClose={() => setOpenKey(null)} />}
    </ScreenState>
  );
};
