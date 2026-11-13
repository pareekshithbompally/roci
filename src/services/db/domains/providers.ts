/**
 * Providers domain — list/upsert/activate/delete AI model providers.
 */

import { call, modelProviderToRust, rustProviderToModelProvider, type RustProviderRow } from '../internal';
import type { ModelProvider } from '@shared/types/modelProviders';

export const providers = {
  /** List all providers. */
  async list(): Promise<ModelProvider[]> {
    const rows = await call<RustProviderRow[]>('providers_list');
    return rows.map(rustProviderToModelProvider);
  },

  /** Create or update a provider. */
  async upsert(provider: ModelProvider): Promise<void> {
    await call<void>('providers_upsert', { input: modelProviderToRust(provider) });
  },

  /** Toggle provider active state. */
  async setActive(provider: string, active: boolean): Promise<void> {
    await call<void>('providers_set_active', { provider, active });
  },

  /** Delete a provider. */
  async delete(provider: string): Promise<void> {
    await call<void>('providers_delete', { provider });
  },
};
