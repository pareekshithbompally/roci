/** Speech detection via the VAD worker; callers treat a rejection as "transcribe everything". */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { SpeechRange } from './types';

const VAD_TIMEOUT_MS = TRANSCRIPTION_CONFIG.vad.timeoutMs;

let worker: Worker | null = null;
let requestId = 0;

const pending = new Map<number, {
  resolve: (segments: Array<{ startMs: number; endMs: number }>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./vad.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.type === 'segments') entry.resolve(msg.segments);
    else entry.reject(new Error(msg.message || 'VAD failed'));
  };
  worker.onerror = (event) => {
    console.error('[VAD] Worker error:', event.message);
  };
  return worker;
}

/** Sorted speech spans in samples; `samples` is transferred to the worker, so slice first if you still need it. */
export async function getSpeechSegments(
  samples: Float32Array,
  sampleRate: number,
): Promise<SpeechRange[]> {
  const id = ++requestId;
  const result = new Promise<Array<{ startMs: number; endMs: number }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`VAD timed out after ${VAD_TIMEOUT_MS}ms`));
    }, VAD_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
  });
  // Length is captured first: postMessage transfers (neuters) the buffer.
  const totalSamples = samples.length;
  getWorker().postMessage({ type: 'vad', id, samples, sampleRate }, [samples.buffer]);
  const segments = await result;
  return segments.map(({ startMs, endMs }) => ({
    startSample: Math.max(0, Math.floor((startMs * sampleRate) / 1000)),
    endSample: Math.min(totalSamples, Math.ceil((endMs * sampleRate) / 1000)),
  }));
}
