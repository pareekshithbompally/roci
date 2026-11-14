/**
 * Voice Service — on-device TTS model lifecycle.
 *
 * Mirrors the embedding service: consent-gated download, worker-isolated
 * load, persisted ready flag, idle teardown. Synthesis (`speak`) arrives
 * with the TTS engine step; this service covers download + readiness only.
 */

import { VOICE_MODEL, VOICE_DTYPE, VOICE_READY_KEY } from './constants';
import { requestVoiceConsent, hasVoiceConsent } from './consent';
import { emitVoiceProgress } from './progress';

let worker: Worker | null = null;
let ready = false;
let loadPromise: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Idle worker lifetime before teardown (mirrors the embedding service). */
const VOICE_IDLE_TIMEOUT_MS = 60_000;

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    new URL('./voice.worker.ts', import.meta.url),
    { type: 'module' },
  );

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;

    switch (msg.type) {
      // The worker's `loaded` is the only completion signal: Kokoro loads via
      // model/tokenizer `from_pretrained`, and transformers emits a `ready`
      // progress event only from `pipeline()`, so none arrives on its own.
      case 'loaded':
        ready = true;
        setVoiceReady(true);
        emitVoiceProgress({ kind: 'voice-model', status: 'ready' });
        console.log('[VoiceService] Model loaded in worker');
        break;

      case 'progress':
        // Forward model download progress to the UI bridge
        switch (msg.status) {
          case 'initiate':
          case 'download':
            emitVoiceProgress({ kind: 'voice-model', status: 'downloading', file: msg.file, percent: 0 });
            break;
          case 'progress':
            emitVoiceProgress({
              kind: 'voice-model',
              status: 'downloading',
              file: msg.file,
              loaded: msg.loaded,
              total: msg.total,
              percent: Math.round(msg.progress ?? 0),
            });
            break;
          case 'done':
            emitVoiceProgress({ kind: 'voice-model', status: 'loading', file: msg.file });
            break;
        }
        break;

      case 'error':
        console.error('[VoiceService] Worker error:', msg.message);
        setVoiceReady(false);
        emitVoiceProgress({ kind: 'voice-model', status: 'error', error: msg.message });
        break;
    }
  };

  worker.onerror = (e) => {
    console.error('[VoiceService] Worker uncaught error:', e);
    setVoiceReady(false);
    emitVoiceProgress({ kind: 'voice-model', status: 'error', error: 'Voice worker crashed' });
  };

  return worker;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    idleTimer = null;
  }, VOICE_IDLE_TIMEOUT_MS);
}

/** Whether the voice model has successfully loaded before (persisted). */
export function isVoiceReady(): boolean {
  try {
    return localStorage.getItem(VOICE_READY_KEY) === 'ready';
  } catch {
    return ready;
  }
}

function setVoiceReady(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(VOICE_READY_KEY, 'ready');
    } else {
      localStorage.removeItem(VOICE_READY_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Load the model, gating on consent only when the call comes from an
 * explicit user gesture (a Download button). Silent otherwise.
 */
async function ensureLoaded(opts: { interactive?: boolean } = {}): Promise<void> {
  if (ready) return;
  if (!loadPromise) {
    // Gate on user consent before downloading the model
    if (!hasVoiceConsent()) {
      if (!opts.interactive) {
        const err = new Error('Voice model download not consented') as Error & { code?: string };
        err.code = 'NOT_CONSENTED';
        throw err;
      }
      const granted = await requestVoiceConsent();
      if (!granted) {
        throw new Error('User declined voice model download');
      }
    }
    loadPromise = new Promise<void>((resolve, reject) => {
      const w = getWorker();
      const onMsg = (e: MessageEvent) => {
        if (e.data.type === 'loaded') {
          w.removeEventListener('message', onMsg);
          resetIdleTimer();
          resolve();
        } else if (e.data.type === 'error') {
          w.removeEventListener('message', onMsg);
          loadPromise = null;
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'load', model: VOICE_MODEL, dtype: VOICE_DTYPE });
    });
  }
  await loadPromise;
}

/**
 * Trigger model download/load without needing to synthesize anything.
 * Interactive (consent modal allowed) by default.
 */
export async function preloadVoice(opts: { interactive?: boolean } = {}): Promise<void> {
  await ensureLoaded({ interactive: opts.interactive ?? true });
}

/** Clear cached worker so the next load retries. Does not wipe the download. */
export function resetVoice(): void {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (worker) {
    worker.terminate();
    worker = null;
  }
  loadPromise = null;
  ready = false;
}
