/** Prices tab data: its rows (re-read when the models.dev list arrives or a price is saved) and saving a price. */

import { useCallback, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { priceUnpricedUsage } from '@extensions/usage';
import { priceRows } from '@features/usage/model/prices';
import { useUsedModels } from '@features/usage/hooks/useUsageQueries';
import type { ModelPrice } from '@shared/types/modelProviders';

/** The price rows, and saving a price (null clears it); a new price also prices that model's earlier calls that had none. */
export function usePriceRows() {
  const catalog = useModelCatalog();
  const { providers, updateProvider } = useSettings();
  const { used, isLoading } = useUsedModels();
  const rows = useMemo(() => priceRows(providers, used), [providers, used, catalog]);

  const setPrice = useCallback((provider: string, modelId: string, price: ModelPrice | null) => {
    updateProvider(provider, (p) => ({
      models: (p.models ?? []).map((m) => (m.id === modelId ? { ...m, price: price ?? undefined } : m)),
    }));
    if (!price) return;
    priceUnpricedUsage(provider, modelId, price).catch((error: unknown) =>
      console.error('[ModelPrices] Pricing earlier calls failed:', error));
  }, [updateProvider]);

  return { rows, setPrice, isLoading };
}
