/** Speak or stop text with the Settings voice, one at a time; state idle → preparing → speaking, `spoken` the chunk. Save
 *  reads it with the same voice into a file kept in Gallery › Audio. */

import { useState } from 'react';
import { create } from 'zustand';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { readAloud } from '@services/readAloud.service';
import { mediaService } from '@services/storage';
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

/** Save in Read Aloud: the text read with the Settings voice and kept in Gallery › Audio; `saving` while it renders. */
export function useSaveSpeech(text: string): { saving: boolean; save: () => void } {
  const [saving, setSaving] = useState(false);
  const { settings, providers } = useSettings();
  const { showToast } = useToast();
  const save = () => {
    if (saving) return;
    setSaving(true);
    const engine = settings.readAloudEngine ?? READ_ALOUD_CONFIG.defaultEngine;
    const voice = settings.readAloudVoice;
    readAloud
      .render(text, { engine, voice, providers })
      .then((wav) => mediaService.saveSpeech(wav, { text, engine, voice }))
      .then(() => showToast(READ_ALOUD_CONFIG.save.saved, 'success'))
      .catch((error: unknown) => {
        report('save')(error);
        showToast(errorMessage(error), 'error');
      })
      .finally(() => setSaving(false));
  };
  return { saving, save };
}

export function useReadAloud(id: string, text: string): ReadAloud {
  const spoken = useSpeakingStore((s) => (s.id === id ? s.spoken : null));
  const state = useSpeakingStore((s): ReadAloudState => (s.id !== id ? 'idle' : s.spoken === null ? 'preparing' : 'speaking'));
  const { settings, providers } = useSettings();
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
      .speak(text, { engine, voice: settings.readAloudVoice, providers }, (chunk) => {
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
