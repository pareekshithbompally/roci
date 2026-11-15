/**
 * useReadAloud — the Read aloud button on a reply: speak it in the voice chosen
 * in Settings › Capabilities › Read aloud, or stop. One reply speaks at a time;
 * starting another stops the first (Rust stops it too).
 */

import { create } from 'zustand';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { readAloud } from '@services/readAloud.service';
import { errorMessage, failureLogger } from '@shared/utils/errors';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';

const report = failureLogger('useReadAloud');

/** The reply being read aloud, if any. */
const useSpeakingStore = create<{ speakingId: string | null }>()(() => ({ speakingId: null }));

export function useReadAloud(id: string, text: string): { speaking: boolean; toggle: () => void } {
  const speaking = useSpeakingStore((s) => s.speakingId === id);
  const { settings } = useSettings();
  const { showToast } = useToast();

  const toggle = () => {
    if (useSpeakingStore.getState().speakingId === id) {
      useSpeakingStore.setState({ speakingId: null });
      readAloud.stop().catch(report('stop'));
      return;
    }
    useSpeakingStore.setState({ speakingId: id });
    readAloud
      .speak(text, settings.readAloudVoice ?? READ_ALOUD_CONFIG.defaultVoice)
      .catch((error: unknown) => {
        report('speak')(error);
        showToast(errorMessage(error), 'error');
      })
      .finally(() => {
        if (useSpeakingStore.getState().speakingId === id) useSpeakingStore.setState({ speakingId: null });
      });
  };

  return { speaking, toggle };
}
