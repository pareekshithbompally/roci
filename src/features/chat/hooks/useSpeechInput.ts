/**
 * useSpeechInput
 *
 * Manages the full chat voice-input lifecycle:
 *   idle → starting → recording ⇄ paused → transcribing → idle
 *
 * `starting` covers the microphone warm-up gap (getUserMedia + recorder
 * setup) so the pill mounts on the same commit as the mic press — the UI
 * never freezes on the old frame and then cuts in late.
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
import { VOICE_ENTER_BEAT_MS } from '@features/chat/components/voice/voiceTransition';

export type SpeechState = 'idle' | 'starting' | 'recording' | 'paused' | 'transcribing';

export interface UseSpeechInputResult {
  state: SpeechState;
  /** Live microphone stream — the composer's DotScope reads its level while recording */
  stream: MediaStream | null;
  /** Elapsed recording time in seconds (frozen while paused) */
  elapsed: number;
  start: () => Promise<void>;
  /** Stop recording and return the transcribed text */
  stop: () => Promise<string>;
  /** Pause the capture (keeps the mic + session alive, freezes the clock) */
  pause: () => void;
  /** Resume a paused capture */
  resume: () => void;
  /** Toggle between paused and recording */
  togglePause: () => void;
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
  /** Set when the master X cancels an in-flight transcription so its late
      result is discarded instead of landing in the composer. */
  const transcriptionCancelledRef = useRef(false);
  /** Set when stop/cancel wins the race against a pending getUserMedia, so
      the late-arriving mic tracks are released instead of going live. */
  const startCancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }, [stopTimer]);

  const cleanup = useCallback(() => {
    stopTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (!mountedRef.current) return;
    setStream(null);
    setElapsed(0);
  }, [stopTimer]);

  // Stop mic tracks and timers if the owning component unmounts mid-record.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
    };
  }, [stopTimer]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    startCancelledRef.current = false;
    transcriptionCancelledRef.current = false;
    // Mount the pill on this commit — the mic warms up underneath it.
    const startedAt = Date.now();
    setState('starting');

    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('[useSpeechInput] Microphone unavailable:', err);
      if (mountedRef.current) setState('idle');
      return;
    }

    if (!mountedRef.current || startCancelledRef.current) {
      micStream.getTracks().forEach(t => t.stop());
      return;
    }

    // Capture starts now — no audio is lost — but the UI stays on the
    // starting pill until its enter beat lands. Flipping to recording
    // mid-enter (analyser spin-up + control swap + scope restage) drops
    // frames and reads as a cut.
    chunksRef.current = [];
    const recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(100); // collect chunks every 100ms

    await new Promise(r => setTimeout(r, Math.max(0, VOICE_ENTER_BEAT_MS - (Date.now() - startedAt))));
    if (!mountedRef.current || startCancelledRef.current) {
      micStream.getTracks().forEach(t => t.stop());
      try { recorder.stop(); } catch { /* already stopped */ }
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      cleanup();
      return;
    }

    streamRef.current = micStream;
    mediaRecorderRef.current = recorder;
    setStream(micStream);
    setState('recording');
    startTimer();
  }, [state, startTimer]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state !== 'recording') return;
    try { recorder.pause(); } catch { /* no-op */ }
    stopTimer();
    setState('paused');
  }, [state, stopTimer]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state !== 'paused') return;
    try { recorder.resume(); } catch { /* no-op */ }
    startTimer();
    setState('recording');
  }, [state, startTimer]);

  const togglePause = useCallback(() => {
    if (state === 'paused') resume();
    else if (state === 'recording') pause();
  }, [state, pause, resume]);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      // A stop during warm-up wins the race against getUserMedia.
      startCancelledRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (!recorder || (state !== 'recording' && state !== 'paused')) {
        cleanup();
        setState('idle');
        resolve('');
        return;
      }

      stopTimer();

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
          // A master-cancel during transcription wins over the late result.
          resolve(transcriptionCancelledRef.current ? '' : text);
          transcriptionCancelledRef.current = false;
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
  }, [state, settings, providers, cleanup, stopTimer]);

  const cancel = useCallback(() => {
    // Cancelling mid-transcription marks the in-flight result for discard —
    // the awaiting stop() resolves to '' instead of filling the composer.
    if (state === 'transcribing') transcriptionCancelledRef.current = true;
    // Cancelling mid-warm-up releases the mic as soon as it arrives.
    if (state === 'starting') startCancelledRef.current = true;
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
  }, [cleanup, state]);

  return { state, stream, elapsed, start, stop, pause, resume, togglePause, cancel };
}
