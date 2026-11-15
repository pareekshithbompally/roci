/**
 * useReadAloud — the Read aloud button on a reply: speak it in the voice chosen
 * in Settings › Capabilities › Read aloud, or stop. One reply speaks at a time;
 * starting another stops the first.
 */

import { create } from 'zustand';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { DEFAULT_VOICE, speak, stopSpeaking } from '@extensions/voice';

/** The reply being read aloud, if any. */
const useSpeakingStore = create<{ speakingId: string | null }>()(() => ({ speakingId: null }));

export function useReadAloud(id: string, text: string): { speaking: boolean; toggle: () => void } {
  const speaking = useSpeakingStore((s) => s.speakingId === id);
  const { settings } = useSettings();
  const { showToast } = useToast();

  const toggle = () => {
    if (useSpeakingStore.getState().speakingId === id) {
      stopSpeaking();
      useSpeakingStore.setState({ speakingId: null });
      return;
    }
    useSpeakingStore.setState({ speakingId: id });
    speak(text, settings.readAloudVoice ?? DEFAULT_VOICE)
      .catch((error: unknown) => {
        console.error('[useReadAloud] Speaking failed:', error);
        showToast('Couldn’t read this aloud', 'error');
      })
      .finally(() => {
        if (useSpeakingStore.getState().speakingId === id) useSpeakingStore.setState({ speakingId: null });
      });
  };

  return { speaking, toggle };
}
