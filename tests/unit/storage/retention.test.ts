import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const purge = vi.fn();
const cancelOwed = vi.fn();
vi.mock('@services/db', () => ({ store: { storage: { purge: (...args: unknown[]) => purge(...args) } } }));
vi.mock('@services/reminder.service', () => ({ reminderService: { cancelOwed: () => cancelOwed() } }));

const { retentionService } = await import('@services/storage/retention.service');

const result = (over: Record<string, unknown> = {}) => ({ meetings: 0, chats: 0, dictations: 0, assets: 0, chat_ids: [], next_due_at: null, ...over });

describe('retention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    purge.mockReset();
    cancelOwed.mockReset();
  });
  afterEach(() => {
    retentionService.stop();
    vi.useRealTimers();
  });

  it('purges now, then once more exactly when the next item comes due', async () => {
    purge.mockResolvedValueOnce(result({ next_due_at: 6_000 })).mockResolvedValue(result());
    await retentionService.apply({ chats: 30 });
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenLastCalledWith({ chats: 30 });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(purge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(purge).toHaveBeenCalledTimes(2);
  });

  it('arms no timer when nothing is due, and cancels owed notices only when something went', async () => {
    purge.mockResolvedValue(result());
    await retentionService.apply({});
    await vi.advanceTimersByTimeAsync(10 ** 9);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(cancelOwed).not.toHaveBeenCalled();

    purge.mockResolvedValue(result({ meetings: 1 }));
    await retentionService.apply({ meetings: 30 });
    expect(cancelOwed).toHaveBeenCalledTimes(1);
  });

  it('a purge started under an older policy never re-arms the timer', async () => {
    let finishOld: (value: unknown) => void = () => {};
    purge.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue(result());
    const old = retentionService.apply({ meetings: 30 });
    await retentionService.apply({});
    finishOld(result({ next_due_at: 2_000 }));
    await old;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(purge).toHaveBeenCalledTimes(2);
  });

  it('tells the chat feature which chats went, and a notice failure never stops the timer', async () => {
    const removed = vi.fn();
    const unsubscribe = retentionService.onChatsRemoved(removed);
    cancelOwed.mockRejectedValue(new Error('notifications off'));
    purge.mockResolvedValueOnce(result({ chats: 1, chat_ids: ['c1'], next_due_at: 3_000 })).mockResolvedValue(result());
    await retentionService.apply({ chats: 30 });
    expect(removed).toHaveBeenCalledWith(['c1']);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(purge).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('Delete All is the same purge with that class kept zero days', async () => {
    purge.mockResolvedValue(result());
    await retentionService.clear('image');
    expect(purge).toHaveBeenCalledWith({ image: 0 });
  });
});
