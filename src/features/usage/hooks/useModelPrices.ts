/** Model Prices data: the models to price (re-read when the models.dev list arrives) and saving a price. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { priceUnpricedUsage } from '@extensions/usage';
import { modelsToPrice } from '@features/usage/model/prices';
import type { ModelPrice } from '@shared/types/modelProviders';

/** The models to price (no price, and the user's own) and saving a price. */
export function useModelPrices() {
  useModelCatalog();
  const { providers, updateProvider } = useSettings();

  /** Saves the model's price (null clears it); a new price also prices its earlier calls that had none. */
  const setPrice = useCallback((provider: string, modelId: string, price: ModelPrice | null) => {
    updateProvider(provider, (p) => ({
      models: (p.models ?? []).map((m) => (m.id === modelId ? { ...m, price: price ?? undefined } : m)),
    }));
    if (!price) return;
    priceUnpricedUsage(provider, modelId, price).catch((error: unknown) =>
      console.error('[ModelPrices] Pricing earlier calls failed:', error));
  }, [updateProvider]);

  return { ...modelsToPrice(providers), setPrice };
}
