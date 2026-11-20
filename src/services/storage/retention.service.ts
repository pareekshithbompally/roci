/** Settings › Storage › Keep, applied: one store purge now, then one timer to the next item that comes due (no polling). */

import { StorageConfig } from '@config/storage.config';
import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { RetentionClass, StorageRetention } from '@shared/types';
import type { PurgeResult } from '@shared/types/native';

type ChatsRemoved = (chatIds: string[]) => void;

let timer: ReturnType<typeof setTimeout> | undefined;
/** The policy in force; a purge started under an older one never re-arms the timer. */
let current: string | null = null;
const chatListeners = new Set<ChatsRemoved>();

/** Every screen showing data a purge can remove reads it again. */
function refreshViews(): void {
  const keys = [
    queryKeys.meetings(), queryKeys.chats(), queryKeys.gallery(), queryKeys.dictations(), queryKeys.storeTodosAll(),
    queryKeys.storageUsage(), queryKeys.indexStats(), queryKeys.appFileUrls(),
  ];
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/** What the store already committed is done; the rest (screens, notices, open chats) follows and never fails the purge. */
async function purge(keepDays: StorageRetention): Promise<PurgeResult> {
  const result = await store.storage.purge(keepDays);
  if (result.meetings + result.chats + result.dictations + result.assets === 0) return result;
  console.log('[retentionService] Removed:', result);
  refreshViews();
  if (result.chat_ids.length > 0) chatListeners.forEach((listener) => listener(result.chat_ids));
  await reminderService.cancelOwed().catch((error: unknown) => console.warn('[retentionService] Owed notices left for launch:', error));
  return result;
}

function arm(keepDays: StorageRetention, dueAt: number | null): void {
  clearTimeout(timer);
  timer = undefined;
  if (dueAt === null) return;
  const delay = Math.min(Math.max(dueAt - Date.now(), 0), StorageConfig.retention.maxTimerMs);
  timer = setTimeout(() => void retentionService.apply(keepDays), delay);
}

export const retentionService = {
  /** Removes what the policy says has expired and arms the timer for the next item; at launch and on every change. */
  async apply(keepDays: StorageRetention): Promise<void> {
    const policy = JSON.stringify(keepDays);
    current = policy;
    try {
      const { next_due_at: dueAt } = await purge(keepDays);
      if (current === policy) arm(keepDays, dueAt);
    } catch (error: unknown) {
      console.error('[retentionService] Purge failed:', error);
    }
  },

  /** Delete All for one class (busy meetings and files not yet saved to a chat stay); throws when the store refuses. */
  async clear(target: RetentionClass): Promise<void> {
    await purge({ [target]: 0 });
  },

  /** Chats a purge removed, for the chat feature to drop from memory; returns the unsubscribe. */
  onChatsRemoved(listener: ChatsRemoved): () => void {
    chatListeners.add(listener);
    return () => chatListeners.delete(listener);
  },

  stop(): void {
    current = null;
    arm({}, null);
  },
};
