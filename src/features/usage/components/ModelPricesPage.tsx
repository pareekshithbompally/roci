/** Settings › Usage › Model Prices: a price for each paid model models.dev has none for, and the prices the user set. */

import React, { useState } from 'react';
import { CardRow, ICON_TILE_PX, Input, Section, Text, useOptionalNavStack } from '@shared/ui';
import { ModelIcon } from '@shared/components';
import { USAGE_CONFIG } from '@config/usage.config';
import { getModelDisplayName, getProviderTitle } from '@shared/utils/provider.utils';
import { SettingsPage } from '@features/settings/components/shared/SettingsPage';
import { useModelPrices } from '@features/usage/hooks/useModelPrices';
import { parsePrice, type PricedModel } from '@features/usage/model/prices';
import { useUsageBack } from '@features/usage/stores/usageStore';
import type { ModelPrice } from '@shared/types/modelProviders';

const COPY = USAGE_CONFIG.copy.prices;

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** Input and output rates; saved when both are numbers (or both cleared) and the field is left. */
const PriceFields: React.FC<{ price?: ModelPrice; onSave: (price: ModelPrice | null) => void }> = ({ price, onSave }) => {
  const [input, setInput] = useState(rateText(price?.inputPer1M));
  const [output, setOutput] = useState(rateText(price?.outputPer1M));
  const save = () => {
    const parsed = parsePrice(input, output);
    if (parsed !== undefined) onSave(parsed);
  };
  return (
    <div className="flex items-center gap-2">
      <Input className="w-24" inputMode="decimal" placeholder={COPY.input} aria-label={COPY.input} value={input} onChange={(e) => setInput(e.target.value)} onBlur={save} />
      <Input className="w-24" inputMode="decimal" placeholder={COPY.output} aria-label={COPY.output} value={output} onChange={(e) => setOutput(e.target.value)} onBlur={save} />
    </div>
  );
};

const PriceRow: React.FC<{ item: PricedModel; onSave: (price: ModelPrice | null) => void }> = ({ item, onSave }) => (
  <CardRow
    leading={<ModelIcon provider={item.provider} modelId={item.model.id} size={ICON_TILE_PX} />}
    title={getModelDisplayName(item.model)}
    description={getProviderTitle(item.provider)}
    actions={<PriceFields price={item.model.price} onSave={onSave} />}
  />
);

export const ModelPricesPage: React.FC = () => {
  const { unpriced, own, setPrice } = useModelPrices();
  const back = useUsageBack();
  const inStack = useOptionalNavStack() !== null;
  const row = (item: PricedModel) => (
    <PriceRow key={`${item.provider}/${item.model.id}`} item={item} onSave={(price) => setPrice(item.provider, item.model.id, price)} />
  );

  return (
    <SettingsPage title={COPY.title} onBack={inStack ? undefined : back}>
      {unpriced.length === 0 && own.length === 0 && <Text as="p" tone="muted" className="text-center py-12">{COPY.none}</Text>}
      {unpriced.length > 0 && <Section title={COPY.unpriced} footer={COPY.unpricedFooter}>{unpriced.map(row)}</Section>}
      {own.length > 0 && <Section title={COPY.own} footer={COPY.ownFooter}>{own.map(row)}</Section>}
    </SettingsPage>
  );
};
