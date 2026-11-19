/** Cloud streaming speech-to-text through the AI SDK (`streamTranscribe`): the same transcription models the recordings use,
 *  fed audio as it is spoken; settled text accumulates, the latest partial is shown until it settles. */

import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { createTranscriptionModel, type TranscriptionFamily } from '@services/ai/provider';
import type { LiveStream, LiveText, StreamingEngine } from './streaming';

/** Float samples as 16-bit little-endian PCM bytes. */
function pcm16(samples: Float32Array): Uint8Array {
  const view = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((s, i) => view.setInt16(i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Uint8Array(view.buffer);
}

const joined = (a: string, b: string) => [a, b].filter((t) => t.trim()).join(' ').trim();

function openStream(family: TranscriptionFamily, model: Parameters<typeof createTranscriptionModel>[1]): LiveStream {
  let push: ReadableStreamDefaultController<Uint8Array> | null = null;
  const audio = new ReadableStream<Uint8Array>({ start: (controller) => { push = controller; } });
  const stop = new AbortController();
  const text: LiveText = { committed: '', tentative: '' };
  let failure: unknown = null;
  const result = streamTranscribe({ model: createTranscriptionModel(family, model), audio, inputAudioFormat: TRANSCRIPTION_CONFIG.streamingFormat, abortSignal: stop.signal });
  const reading = (async () => {
    for await (const part of result.fullStream) {
      if (part.type === 'transcript-partial') text.tentative = part.text;
      if (part.type === 'transcript-final') Object.assign(text, { committed: joined(text.committed, part.text), tentative: '' });
    }
  })().catch((error: unknown) => {
    failure = error;
  });
  const failed = () => {
    if (failure) throw failure;
  };
  return {
    async feed(pcm) {
      failed();
      push?.enqueue(pcm16(pcm));
      return { ...text };
    },
    async finish() {
      push?.close();
      await reading;
      failed();
      return joined(text.committed, text.tentative);
    },
    async cancel() {
      stop.abort();
      await reading;
    },
  };
}

/** A cloud engine that streams the models `streams` names; each stream is its own connection, so any number run at once. */
export function sdkStreaming(family: TranscriptionFamily, streams: (model: string) => boolean): StreamingEngine {
  return {
    concurrent: Number.POSITIVE_INFINITY,
    streams,
    async open({ model, resolved }) {
      if (!resolved) throw new Error('This speech model needs credentials.');
      return openStream(family, { ...resolved, modelId: model });
    },
  };
}
