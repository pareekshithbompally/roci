import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@services/db', () => ({ store: { dictations: { create } } }));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true }));
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries } }));

import { keepDictation } from '@services/dictations.service';
import { queryKeys } from '@shared/query/queryKeys';

describe('keepDictation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the text, its length and speech model, then refreshes Dictations', async () => {
    create.mockResolvedValue(undefined);
    await keepDictation('Ship it Friday', 4_000, 'parakeet');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ship it Friday', durationMs: 4_000, model: 'parakeet' }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.dictations() });
  });

  it('skips an empty dictation', async () => {
    await keepDictation('   ', 1_000, 'parakeet');
    expect(create).not.toHaveBeenCalled();
  });

  it('logs a failed save instead of throwing', async () => {
    create.mockRejectedValue(new Error('disk full'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(keepDictation('Hello', 1_000, 'parakeet')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
