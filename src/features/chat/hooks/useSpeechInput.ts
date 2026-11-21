/** Chat voice input lifecycle (idle → starting → recording ⇄ paused → transcribing), live or recorded. */

import { useState, useRef, useCallback, useEffect } from 'react';
import { audioToRawText } from '@services/unifiedAIService';
import { keepDictation } from '@services/dictations.service';
import { liveCapture, recordedCapture } from '@services/ai/transcription';
import type { DictationCapture, LiveText } from '@services/ai/transcription';
import type { LiveDictation } from '@features/settings';
import { errorMessage, failureLogger } from '@shared/utils/errors';
import { showToast } from '@shared/ui';
import { DICTATION_COPY } from '@config/chat.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';
import { VOICE_ENTER_BEAT_MS } from '@features/chat/components/voice/voiceTransition';

export type SpeechState = 'idle' | 'starting' | 'recording' | 'paused' | 'transcribing';

const report = failureLogger('useSpeechInput');

/** The page's audio session (W3C Audio Session API, WebKit); not in TypeScript's DOM types yet. */
type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';

/** The microphone only runs while the page's session is `play-and-record` or `auto` (spec); dictation declares it, then hands back. */
function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession;
  if (session) session.type = type;
}

/** A dictation failure is logged and told to the user with its reason (the pill closes either way). */
function fail(step: string, copy: string, error: unknown): void {
  report(step)(error);
  showToast(`${copy}: ${errorMessage(error)}`, 'error');
}

export interface UseSpeechInputResult {
  state: SpeechState;
  /** Live microphone stream — the composer's DotScope reads its level while recording */
  stream: MediaStream | null;
  /** The text so far once a live stream answers; null until then, and when dictation is not live (the plain recording pill). */
  liveText: LiveText | null;
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

const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

export function useSpeechInput(
  settings: AppSettings,
  providers: ModelProvider[],
  live: LiveDictation | null,
): UseSpeechInputResult {
  const [state, setState] = useState<SpeechState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [liveText, setLiveText] = useState<LiveText | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const captureRef = useRef<DictationCapture | null>(null);
  /** Set when cancel hits an in-flight transcription so its late result is discarded. */
  const transcriptionCancelledRef = useRef(false);
  /** Set when stop/cancel beats a pending start so the late mic and capture are released. */
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

  /** Releases the mic and resets the visible state (the capture is the caller's). */
  const cleanup = useCallback(() => {
    stopTimer();
    stopTracks(streamRef.current);
    streamRef.current = null;
    captureRef.current = null;
    setAudioSession('auto');
    if (!mountedRef.current) return;
    setStream(null);
    setLiveText(null);
    setElapsed(0);
  }, [stopTimer]);

  // Stop mic tracks, capture and timers if the owning component unmounts mid-record.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTimer();
      stopTracks(streamRef.current);
      streamRef.current = null;
      captureRef.current?.cancel();
      captureRef.current = null;
      setAudioSession('auto');
    };
  }, [stopTimer]);

  const beginCapture = useCallback((micStream: MediaStream): Promise<DictationCapture> => {
    const transcribe = (audio: Blob) => audioToRawText(audio, settings, providers);
    if (!live) return Promise.resolve(recordedCapture(micStream, transcribe));
    return liveCapture(micStream, live.open, (text) => {
      if (mountedRef.current) setLiveText(text);
    }, transcribe);
  }, [live, settings, providers]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    startCancelledRef.current = false;
    transcriptionCancelledRef.current = false;
    // Mount the pill now; the mic warms up underneath it.
    const startedAt = Date.now();
    setState('starting');

    let micStream: MediaStream;
    let capture: DictationCapture;
    try {
      setAudioSession('play-and-record');
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error: unknown) {
      fail('open the microphone', DICTATION_COPY.startFailed, error);
      cleanup();
      if (mountedRef.current) setState('idle');
      return;
    }
    try {
      // Capture starts now — no audio is lost.
      capture = await beginCapture(micStream);
    } catch (error: unknown) {
      fail('start capture', DICTATION_COPY.startFailed, error);
      stopTracks(micStream);
      cleanup();
      if (mountedRef.current) setState('idle');
      return;
    }

    // Stay on the starting pill until its enter beat lands; flipping mid-enter drops frames.
    await new Promise(r => setTimeout(r, Math.max(0, VOICE_ENTER_BEAT_MS - (Date.now() - startedAt))));
    if (!mountedRef.current || startCancelledRef.current) {
      capture.cancel();
      stopTracks(micStream);
      cleanup();
      return;
    }

    streamRef.current = micStream;
    captureRef.current = capture;
    setStream(micStream);
    setState('recording');
    startTimer();
  }, [state, live, beginCapture, cleanup, startTimer]);

  const pause = useCallback(() => {
    if (!captureRef.current || state !== 'recording') return;
    captureRef.current.pause();
    stopTimer();
    setState('paused');
  }, [state, stopTimer]);

  const resume = useCallback(() => {
    if (!captureRef.current || state !== 'paused') return;
    captureRef.current.resume();
    startTimer();
    setState('recording');
  }, [state, startTimer]);

  const togglePause = useCallback(() => {
    if (state === 'paused') resume();
    else if (state === 'recording') pause();
  }, [state, pause, resume]);

  const stop = useCallback(async (): Promise<string> => {
    // A stop during warm-up wins the race against the pending start.
    startCancelledRef.current = true;
    const capture = captureRef.current;
    if (!capture || (state !== 'recording' && state !== 'paused')) {
      cleanup();
      setState('idle');
      return '';
    }

    stopTimer();
    setState('transcribing');
    // finish() stops the capture before it awaits; the mic is released at once.
    const finishing = capture.finish();
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    try {
      const text = await finishing;
      // A master-cancel during transcription wins over the late result.
      if (transcriptionCancelledRef.current) return '';
      void keepDictation(text, elapsed * 1000, settings.transcriptionModel);
      return text;
    } catch (error: unknown) {
      fail('transcribe', DICTATION_COPY.transcribeFailed, error);
      return '';
    } finally {
      transcriptionCancelledRef.current = false;
      cleanup();
      if (mountedRef.current) setState('idle');
    }
  }, [state, cleanup, stopTimer, elapsed, settings.transcriptionModel]);

  const cancel = useCallback(() => {
    // Cancelling mid-transcription makes the awaiting stop() resolve to ''.
    if (state === 'transcribing') transcriptionCancelledRef.current = true;
    // Cancelling mid-warm-up releases the mic as soon as it arrives.
    if (state === 'starting') startCancelledRef.current = true;
    captureRef.current?.cancel();
    cleanup();
    setState('idle');
  }, [cleanup, state]);

  return { state, stream, liveText, elapsed, start, stop, pause, resume, togglePause, cancel };
}
