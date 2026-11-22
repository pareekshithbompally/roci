/** Keeps each finished dictation for the Dictations page; a failure is logged and never reaches the dictation itself. */

import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { modelKey } from '@services/ai/models';
import { speechSelectionOf } from '@services/ai/transcription';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { AppSettings } from '@shared/types';

/** A dictation as it starts: its id (its usage rows carry it) and the speech model it runs on, as a model key. Taken from
 *  the settings its capture starts with, so a model changed mid-dictation never renames it. */
export interface DictationStart {
  id: string;
  model?: string;
}

export function startDictation(settings: AppSettings): DictationStart {
  const selection = speechSelectionOf(settings);
  return { id: crypto.randomUUID(), model: selection ? modelKey(selection) : undefined };
}

/** Saves the finished dictation under its start's id and model. */
export async function keepDictation({ id, model }: DictationStart, text: string, durationMs: number): Promise<void> {
  if (!isTauriEnvironment() || !text.trim()) return;
  try {
    await store.dictations.create({ id, text, createdAt: Date.now(), durationMs, model });
    await queryClient.invalidateQueries({ queryKey: queryKeys.dictations() });
  } catch (error: unknown) {
    console.error('[Dictations] Failed to keep dictation:', error);
  }
}
