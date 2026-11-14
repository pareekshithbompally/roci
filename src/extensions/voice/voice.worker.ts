/**
 * Voice Web Worker
 *
 * Runs Kokoro TTS model loading off the main thread, mirroring the embedding
 * worker. Speech synthesis (`speak`) lands with the TTS engine step — this
 * worker currently covers model download + load only.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { type: 'load', model, dtype }          — load/preload the model
 *
 *   Worker → Main:
 *     { type: 'loaded' }                      — model is ready
 *     { type: 'progress', ...progressData }   — model download progress
 *     { type: 'error', message }              — load failure
 */

let ttsInstance: any = null;

async function loadVoice(model: string, dtype: 'q8' | 'fp32' | 'fp16' | 'q4' | 'q4f16') {
  if (ttsInstance) return ttsInstance;

  const { KokoroTTS } = await import('kokoro-js');

  ttsInstance = await KokoroTTS.from_pretrained(model, {
    dtype,
    device: 'wasm',
    progress_callback: (event: any) => {
      self.postMessage({ type: 'progress', ...event });
    },
  });

  return ttsInstance;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case 'load': {
        await loadVoice(msg.model, msg.dtype);
        self.postMessage({ type: 'loaded' });
        break;
      }
    }
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      message: error?.message || 'Voice model load failed',
    });
  }
};
