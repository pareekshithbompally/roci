/** Chat voice input lifecycle (idle → starting → recording → transcribing), live or recorded. */

import { useState, useRef, useCallback, useEffect } from 'react';
import { audioToRawText } from '@services/unifiedAIService';
import { keepDictation, startDictation, type DictationStart } from '@services/dictations.service';
import { liveCapture, recordedCapture } from '@services/ai/transcription';
import type { DictationCapture, LiveText } from '@services/ai/transcription';
import type { LiveDictation } from '@features/settings';
import { errorMessage, failureLogger } from '@shared/utils/errors';
import { showToast } from '@shared/ui';
import { DICTATION_COPY } from '@config/chat.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';
import { haptic } from '@platform/haptics';
import { VOICE_ENTER_BEAT_MS } from '@features/chat/components/voice/voiceTransition';

export type SpeechState = 'idle' | 'starting' | 'recording' | 'transcribing';

/** How the last dictation ended: words came back, none did, transcription failed, or it was cancelled (or the mic never started). */
export type SpeechEnd = 'text' | 'empty' | 'failed' | 'aborted';

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
  /** How the last dictation ended, set in the same render as `idle`; null from a new start. */
  ended: SpeechEnd | null;
  /** The live stream dropped mid-way: its words stay, and the recording is transcribed on stop instead. */
  liveLost: boolean;
  /** Live microphone stream — the composer's Horizon reads its bands while recording */
  stream: MediaStream | null;
  /** The text so far once a live stream answers; null until then, and when dictation is not live (the plain recording pill). */
  liveText: LiveText | null;
  /** Elapsed recording time in seconds */
  elapsed: number;
  start: () => Promise<void>;
  /** Stop recording and return the transcribed text */
  stop: () => Promise<string>;
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
  const [ended, setEnded] = useState<SpeechEnd | null>(null);
  const [liveLost, setLiveLost] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [liveText, setLiveText] = useState<LiveText | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const captureRef = useRef<DictationCapture | null>(null);
  /** This dictation's id and model from its start: its usage rows carry the id (its cost), and it is kept under both. */
  const dictationRef = useRef<DictationStart | null>(null);
  /** Counts dictations. A late mic, capture or transcription finishes only the attempt it belongs to: a stop during
   *  warm-up and a cancel move it on, so their stragglers are released or discarded and never end the next dictation. */
  const attemptRef = useRef(0);
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
    setLiveLost(false);
    setElapsed(0);
  }, [stopTimer]);

  /** Ends the dictation: releases everything and says how it ended, in the same render as `idle`. */
  const endAs = useCallback((how: SpeechEnd) => {
    cleanup();
    if (!mountedRef.current) return;
    setEnded(how);
    setState('idle');
  }, [cleanup]);

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

  const beginCapture = useCallback((micStream: MediaStream, dictationId: string): Promise<DictationCapture> => {
    const transcribe = (audio: Blob) => audioToRawText(audio, settings, providers, dictationId);
    if (!live) return Promise.resolve(recordedCapture(micStream, transcribe));
    return liveCapture(micStream, () => live.open(dictationId), (text) => {
      if (mountedRef.current) setLiveText(text);
    }, transcribe, () => {
      if (mountedRef.current) setLiveLost(true);
    });
  }, [live, settings, providers]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    const attempt = ++attemptRef.current;
    const current = () => attempt === attemptRef.current;
    setEnded(null);
    // Mount the pill now; the mic warms up underneath it.
    const startedAt = Date.now();
    const dictation = startDictation(settings);
    dictationRef.current = dictation;
    setState('starting');

    let micStream: MediaStream;
    let capture: DictationCapture;
    try {
      setAudioSession('play-and-record');
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error: unknown) {
      if (!current()) return;
      fail('open the microphone', DICTATION_COPY.startFailed, error);
      endAs('aborted');
      return;
    }
    try {
      // Capture starts now — no audio is lost.
      capture = await beginCapture(micStream, dictation.id);
    } catch (error: unknown) {
      stopTracks(micStream);
      if (!current()) return;
      fail('start capture', DICTATION_COPY.startFailed, error);
      endAs('aborted');
      return;
    }

    // Stay on the starting pill until its enter beat lands; flipping mid-enter drops frames.
    await new Promise(r => setTimeout(r, Math.max(0, VOICE_ENTER_BEAT_MS - (Date.now() - startedAt))));
    if (!mountedRef.current || !current()) {
      capture.cancel();
      stopTracks(micStream);
      cleanup();
      return;
    }

    streamRef.current = micStream;
    captureRef.current = capture;
    setStream(micStream);
    setState('recording');
    haptic('listening');
    startTimer();
  }, [state, settings, beginCapture, cleanup, endAs, startTimer]);

  const stop = useCallback(async (): Promise<string> => {
    const capture = captureRef.current;
    const dictation = dictationRef.current;
    if (!capture || !dictation || state !== 'recording') {
      // A stop during warm-up wins the race against the pending start.
      attemptRef.current += 1;
      endAs('aborted');
      return '';
    }
    const attempt = attemptRef.current;
    const current = () => attempt === attemptRef.current;

    stopTimer();
    setState('transcribing');
    // finish() stops the capture before it awaits; the mic is released at once.
    const finishing = capture.finish();
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    let how: SpeechEnd = 'failed';
    try {
      const text = (await finishing).trim();
      // A cancel during transcription wins over the late result (cancel() has already ended it).
      if (!current()) return '';
      void keepDictation(dictation, text, elapsed * 1000);
      how = text ? 'text' : 'empty';
      return text;
    } catch (error: unknown) {
      if (!current()) return '';
      fail('transcribe', DICTATION_COPY.transcribeFailed, error);
      haptic('failed');
      return '';
    } finally {
      if (current()) endAs(how);
    }
  }, [state, endAs, stopTimer, elapsed]);

  const cancel = useCallback(() => {
    // Mid-transcription the awaiting stop() resolves to ''; mid-warm-up the mic is released as soon as it arrives.
    attemptRef.current += 1;
    captureRef.current?.cancel();
    endAs('aborted');
  }, [endAs]);

  return { state, ended, liveLost, stream, liveText, elapsed, start, stop, cancel };
}
