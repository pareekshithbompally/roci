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

import { useState, useRef, useCallback } from 'react';
import { resolveModel } from '@shared/utils/modelResolver';
import { audioToRawText } from '@services/unifiedAIService';
import type { ModelProvider } from '@shared/types/modelProviders';

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
  transcriptionModelId: string,
  providers: ModelProvider[],
): UseSpeechInputResult {
  const [state, setState] = useState<SpeechState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setElapsed(0);
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
        setStream(null);

        const resolved = resolveModel(transcriptionModelId, providers);
        if (!resolved?.apiKey) {
          setState('idle');
          setElapsed(0);
          resolve('');
          return;
        }

        setState('transcribing');
        try {
          const text = await audioToRawText(blob, resolved);
          resolve(text);
        } catch (err) {
          console.error('[useSpeechInput] Transcription failed:', err);
          resolve('');
        } finally {
          setState('idle');
          setElapsed(0);
        }
      };

      recorder.stop();
    });
  }, [state, transcriptionModelId, providers, cleanup]);

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
