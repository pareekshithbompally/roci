/** A cloud provider's row reads the same saved connection test as its detail page: a refused key is never a green dot. */

import { describe, it, expect } from 'vitest';
import { cloudRowState } from '@features/settings/components/ProviderStatus';
import type { ModelProvider } from '@shared/types/modelProviders';

function provider(overrides: Partial<ModelProvider> & { key?: string }): ModelProvider {
  const { key = '', ...rest } = overrides;
  return {
    provider: 'openai',
    active: true,
    settings: [{ key: 'api-key', controller_props: { value: key } }],
    ...rest,
  } as unknown as ModelProvider;
}

describe('cloudRowState', () => {
  it('off when turned off', () => {
    expect(cloudRowState(provider({ active: false, key: 'sk' }))).toBe('off');
  });
  it('needs a key when it has none', () => {
    expect(cloudRowState(provider({}))).toBe('attention');
  });
  it('on with a key not yet tested, or that passed', () => {
    expect(cloudRowState(provider({ key: 'sk' }))).toBe('ready');
    expect(cloudRowState(provider({ key: 'sk', connection_check: { ok: true, at: 1, models: 3 } }))).toBe('ready');
  });
  it("can't connect when its last test failed", () => {
    expect(cloudRowState(provider({ key: 'sk', connection_check: { ok: false, at: 1, message: '401' } }))).toBe('failed');
  });
});
