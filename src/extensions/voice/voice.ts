/**
 * Read aloud — speak a reply with the chosen voice, stop it, and download the
 * downloadable voices (one worker holds one loaded voice at a time).
 *
 * macOS voices go through WebKit's `speechSynthesis` (Apple's system voices);
 * Kokoro and Supertonic synthesize sentence by sentence in the worker and
 * play through Web Audio, the next chunk synthesizing while one plays.
 */

import { DOWNLOADABLE_VOICES, voiceReadyKey } from './constants';
import type { DownloadableVoiceId, VoiceId } from './constants';
import { emitVoiceProgress } from './progress';
import { sentenceChunks, speakableText } from './text';

interface Clip {
  audio: Float32Array;
  samplingRate: number;
}

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
const loads = new Map<DownloadableVoiceId, { promise: Promise<void>; waiter: Waiter<void> }>();
const clips = new Map<number, Waiter<Clip>>();
let nextRequest = 0;

// ── Downloads ──

export function isVoiceReady(id: DownloadableVoiceId): boolean {
  try {
    return localStorage.getItem(voiceReadyKey(id)) === 'ready';
  } catch {
    return false;
  }
}

function setReady(id: DownloadableVoiceId, ready: boolean): void {
  try {
    if (ready) localStorage.setItem(voiceReadyKey(id), 'ready');
    else localStorage.removeItem(voiceReadyKey(id));
  } catch {
    // localStorage unavailable
  }
}

function onProgress(id: DownloadableVoiceId, msg: { status: string; file?: string; progress?: number }): void {
  if (msg.status === 'initiate' || msg.status === 'download' || msg.status === 'progress') {
    emitVoiceProgress({ kind: 'voice-model', voice: id, status: 'downloading', file: msg.file, percent: Math.round(msg.progress ?? 0) });
  } else if (msg.status === 'done') {
    emitVoiceProgress({ kind: 'voice-model', voice: id, status: 'loading', file: msg.file });
  }
}

function settleLoad(id: DownloadableVoiceId, error?: string): void {
  const load = loads.get(id);
  loads.delete(id);
  setReady(id, !error);
  emitVoiceProgress({ kind: 'voice-model', voice: id, status: error ? 'error' : 'ready', error });
  if (error) load?.waiter.reject(new Error(error));
  else load?.waiter.resolve();
}

function handleMessage({ data: msg }: MessageEvent): void {
  if (msg.type === 'progress') onProgress(msg.id, msg);
  else if (msg.type === 'loaded') settleLoad(msg.id);
  else if (msg.type === 'audio') clips.get(msg.requestId)?.resolve({ audio: msg.audio, samplingRate: msg.samplingRate });
  else if (msg.type === 'error' && msg.id) settleLoad(msg.id, msg.message);
  else if (msg.type === 'error') clips.get(msg.requestId)?.reject(new Error(msg.message));
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = handleMessage;
  worker.onerror = (event) => {
    console.error('[Voice] Worker crashed:', event);
    for (const id of loads.keys()) settleLoad(id, 'Voice worker crashed');
  };
  return worker;
}

/** Download (first time) and load a voice. A Download press is the consent. */
export function loadVoice(id: DownloadableVoiceId): Promise<void> {
  const pending = loads.get(id);
  if (pending) return pending.promise;
  let waiter!: Waiter<void>;
  const promise = new Promise<void>((resolve, reject) => (waiter = { resolve, reject }));
  loads.set(id, { promise, waiter });
  getWorker().postMessage({ type: 'load', id, spec: DOWNLOADABLE_VOICES[id] });
  return promise;
}

/** Forget a voice's ready flag so the next load downloads it again. */
export function resetVoice(id: DownloadableVoiceId): void {
  setReady(id, false);
  worker?.terminate();
  worker = null;
}

// ── Speaking ──

let session = 0;
let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;

function synthesize(text: string): Promise<Clip> {
  const requestId = ++nextRequest;
  return new Promise<Clip>((resolve, reject) => {
    clips.set(requestId, { resolve, reject });
    getWorker().postMessage({ type: 'speak', requestId, text });
  }).finally(() => clips.delete(requestId));
}

function play({ audio, samplingRate }: Clip): Promise<void> {
  context ??= new AudioContext();
  const buffer = context.createBuffer(1, audio.length, samplingRate);
  buffer.copyToChannel(audio, 0);
  source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const done = new Promise<void>((resolve) => { source!.onended = () => resolve(); });
  source.start();
  return done;
}

function speakWithSystem(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

async function speakWithModel(id: DownloadableVoiceId, text: string, mine: number): Promise<void> {
  await loadVoice(id);
  const chunks = sentenceChunks(text);
  let next = chunks.length > 0 ? synthesize(chunks[0]) : null;
  for (let i = 0; next && i < chunks.length; i += 1) {
    const clip = await next;
    if (mine !== session) return;
    next = i + 1 < chunks.length ? synthesize(chunks[i + 1]) : null;
    await play(clip);
    if (mine !== session) return;
  }
}

/** Speak a reply (markdown) with `voice`; resolves when it finishes or is stopped. */
export async function speak(markdown: string, voice: VoiceId): Promise<void> {
  stopSpeaking();
  const mine = session;
  const text = speakableText(markdown);
  if (!text) return;
  if (voice === 'macos') return speakWithSystem(text);
  return speakWithModel(voice, text, mine);
}

export function stopSpeaking(): void {
  session += 1;
  speechSynthesis.cancel();
  source?.stop();
  source = null;
}
