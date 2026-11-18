/** Keeps each finished dictation for the Dictations page; a failure is logged and never reaches the dictation itself. */

import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

export async function keepDictation(text: string, durationMs: number, model: string): Promise<void> {
  if (!isTauriEnvironment() || !text.trim()) return;
  try {
    await store.dictations.create({ id: crypto.randomUUID(), text, createdAt: Date.now(), durationMs, model });
    await queryClient.invalidateQueries({ queryKey: queryKeys.dictations() });
  } catch (error: unknown) {
    console.error('[Dictations] Failed to keep dictation:', error);
  }
}
