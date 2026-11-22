import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@services/db', () => ({ store: { dictations: { create } } }));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true }));
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries } }));

import { keepDictation, startDictation } from '@services/dictations.service';
import { queryKeys } from '@shared/query/queryKeys';
import type { AppSettings } from '@shared/types';

const settings: AppSettings = { transcriptionProvider: 'openai', transcriptionModel: 'whisper-1' } as AppSettings;

describe('keepDictation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a start takes a fresh id and the speech model it runs on, as a model key', () => {
    const start = startDictation(settings);
    expect(start.model).toBe('openai::whisper-1');
    expect(start.id).not.toBe(startDictation(settings).id);
  });

  it('keeps it under its start\'s id and model, even when the model changed since, then refreshes Dictations', async () => {
    create.mockResolvedValue(undefined);
    const start = startDictation(settings);
    settings.transcriptionModel = 'gpt-4o-mini-transcribe';
    await keepDictation(start, 'Ship it Friday', 4_000);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: start.id, text: 'Ship it Friday', durationMs: 4_000, model: 'openai::whisper-1' }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.dictations() });
  });

  it('skips an empty dictation', async () => {
    await keepDictation({ id: 'd-2' }, '   ', 1_000);
    expect(create).not.toHaveBeenCalled();
  });

  it('logs a failed save instead of throwing', async () => {
    create.mockRejectedValue(new Error('disk full'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(keepDictation({ id: 'd-3' }, 'Hello', 1_000)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
