/** Speak or stop text with the Settings voice, one at a time; state idle → preparing → speaking, `spoken` the chunk. */

import { create } from 'zustand';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { readAloud } from '@services/readAloud.service';
import { errorMessage, failureLogger } from '@shared/utils/errors';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';

const report = failureLogger('useReadAloud');

export type ReadAloudState = 'idle' | 'preparing' | 'speaking';

export interface ReadAloud {
  state: ReadAloudState;
  /** The chunk of text being heard now; null when nothing is. */
  spoken: string | null;
  toggle: () => void;
}

/** What is being read aloud now (by caller id), and the chunk being heard. */
const useSpeakingStore = create<{ id: string | null; spoken: string | null }>()(() => ({ id: null, spoken: null }));
const idle = () => useSpeakingStore.setState({ id: null, spoken: null });

export function useReadAloud(id: string, text: string): ReadAloud {
  const spoken = useSpeakingStore((s) => (s.id === id ? s.spoken : null));
  const state = useSpeakingStore((s): ReadAloudState => (s.id !== id ? 'idle' : s.spoken === null ? 'preparing' : 'speaking'));
  const { settings } = useSettings();
  const { showToast } = useToast();

  const toggle = () => {
    if (useSpeakingStore.getState().id === id) {
      idle();
      void readAloud.stop();
      return;
    }
    useSpeakingStore.setState({ id, spoken: null });
    const engine = settings.readAloudEngine ?? READ_ALOUD_CONFIG.defaultEngine;
    readAloud
      .speak(text, engine, settings.readAloudVoice, (chunk) => {
        if (useSpeakingStore.getState().id === id) useSpeakingStore.setState({ spoken: chunk });
      })
      .catch((error: unknown) => {
        report('speak')(error);
        showToast(errorMessage(error), 'error');
      })
      .finally(() => {
        if (useSpeakingStore.getState().id === id) idle();
      });
  };

  return { state, spoken, toggle };
}
