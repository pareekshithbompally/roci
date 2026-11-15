/** Silero VAD off the main thread; self-hosted assets, and the NRT path needs silero_vad_legacy.onnx. */

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
