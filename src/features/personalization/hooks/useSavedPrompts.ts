/** Saved prompts (the chat box's "/" menu) and their edits, saved with Personalization like every setting. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import type { SavedPrompt } from '@config/personalization.config';
import { usePersonalizationUpdate } from '@features/personalization/hooks/usePersonalization';

const NONE: SavedPrompt[] = [];

export function useSavedPrompts() {
  const savedPrompts = useSettings().settings.personalization?.savedPrompts ?? NONE;
  const update = usePersonalizationUpdate();
  /** Adds a prompt (new id) or replaces the one with its id, in place. */
  const save = useCallback(
    (prompt: SavedPrompt) =>
      update(({ savedPrompts: current = [] }) => ({
        savedPrompts: current.some((p) => p.id === prompt.id) ? current.map((p) => (p.id === prompt.id ? prompt : p)) : [...current, prompt],
      })),
    [update],
  );
  const remove = useCallback(
    (id: string) => update(({ savedPrompts: current = [] }) => ({ savedPrompts: current.filter((p) => p.id !== id) })),
    [update],
  );
  return { savedPrompts, save, remove };
}
