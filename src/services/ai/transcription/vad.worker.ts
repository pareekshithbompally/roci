/**
 * Silero VAD Web Worker
 *
 * Runs voice activity detection off the main thread: a 2-hour recording is
 * ~460 MB of samples and VAD is single-threaded WASM, so this must never run
 * where React renders.
 *
 * One NonRealTimeVAD lives for the worker's lifetime. That is state-safe:
 * run() always finishes through FrameProcessor.endSegment, which resets the
 * model's LSTM state, so consecutive recordings start clean with no leak.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { type: 'vad', id, samples, sampleRate } — Float32Array mono samples
 *       (transferred; the sender loses access)
 *   Worker → Main:
 *     { type: 'segments', id, segments: [{ startMs, endMs }] }
 *     { type: 'error', id?, message }
 *
 * Assets are self-hosted, never CDN (see vite.config.ts): the NRT path uses
 * the legacy Silero wrapper, so the model file must be silero_vad_legacy.onnx.
 */

import { NonRealTimeVAD } from '@ricky0123/vad-web';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

const MODEL_URL = '/models/silero_vad_legacy.onnx';
const ORT_WASM_PATH = '/ort/';

let vadPromise: Promise<NonRealTimeVAD> | null = null;

function getVad(): Promise<NonRealTimeVAD> {
  vadPromise ??= NonRealTimeVAD.new({
    modelURL: MODEL_URL,
    ortConfig: (ort) => {
      // The Tauri webview has no COOP/COEP headers, so no multi-threading.
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';
      ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    },
    positiveSpeechThreshold: TRANSCRIPTION_CONFIG.vad.positiveSpeechThreshold,
    negativeSpeechThreshold: TRANSCRIPTION_CONFIG.vad.negativeSpeechThreshold,
    redemptionMs: TRANSCRIPTION_CONFIG.vad.redemptionMs,
    preSpeechPadMs: TRANSCRIPTION_CONFIG.vad.preSpeechPadMs,
    minSpeechMs: TRANSCRIPTION_CONFIG.vad.minSpeechMs,
  });
  return vadPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg?.type !== 'vad') return;
  try {
    const vad = await getVad();
    const segments: Array<{ startMs: number; endMs: number }> = [];
    for await (const { start, end } of vad.run(msg.samples as Float32Array, msg.sampleRate as number)) {
      segments.push({ startMs: start, endMs: end });
    }
    self.postMessage({ type: 'segments', id: msg.id, segments });
  } catch (error: unknown) {
    vadPromise = null;
    self.postMessage({
      type: 'error',
      id: msg.id,
      message: error instanceof Error ? error.message : 'VAD failed',
    });
  }
};
