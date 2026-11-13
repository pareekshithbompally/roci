/**
 * useSpeechInput
 *
 * Manages the full chat voice-input lifecycle:
 *   idle → recording → transcribing → idle
 *
 * Exposes the live MediaStream so callers can drive a waveform visualizer.
 * Transcription is delegated to audioToRawText() — the shared primitive that
 * routes to Whisper (openai/groq) or Gemini multimodal depending on the
 * configured transcription model provider.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { audioToRawText } from '@services/unifiedAIService';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

export interface UseSpeechInputResult {
  state: SpeechState;
  /** Live microphone stream — hand to VoiceWaveform while recording */
  stream: MediaStream | null;
  /** Elapsed recording time in seconds */
  elapsed: number;
  start: () => Promise<void>;
  /** Stop recording and return the transcribed text */
  stop: () => Promise<string>;
  /** Discard recording without transcribing */
  cancel: () => void;
}

export function useSpeechInput(
  settings: AppSettings,
  providers: ModelProvider[],
): UseSpeechInputResult {
  const [state, setState] = useState<SpeechState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (!mountedRef.current) return;
    setStream(null);
    setElapsed(0);
  }, []);

  // Stop mic tracks and timers if the owning component unmounts mid-record.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (state !== 'idle') return;

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = micStream;
    setStream(micStream);
    chunksRef.current = [];

    const recorder = new MediaRecorder(micStream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(100); // collect chunks every 100ms
    setState('recording');

    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }, [state]);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || state !== 'recording') {
        cleanup();
        setState('idle');
        resolve('');
        return;
      }

      // Clear timer before state change
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        // Stop mic tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (mountedRef.current) setStream(null);

        if (mountedRef.current) setState('transcribing');
        try {
          const text = await audioToRawText(blob, settings, providers);
          resolve(text);
        } catch (err) {
          console.error('[useSpeechInput] Transcription failed:', err);
          resolve('');
        } finally {
          if (mountedRef.current) {
            setState('idle');
            setElapsed(0);
          }
        }
      };

      recorder.stop();
    });
  }, [state, settings, providers, cleanup]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cleanup();
    setState('idle');
  }, [cleanup]);

  return { state, stream, elapsed, start, stop, cancel };
}
