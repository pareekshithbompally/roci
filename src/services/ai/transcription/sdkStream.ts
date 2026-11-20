/** Cloud streaming speech-to-text through the AI SDK (`streamTranscribe`): the same transcription models the recordings use,
 *  fed audio as it is spoken. Words still being spoken show as they come (a partial, or a stretch's deltas so far); each
 *  stretch settles once, whole, with its final text. */

import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { createTranscriptionModel, type TranscriptionFamily } from '@services/ai/provider';
import { samplesToPcm16, streamResampler } from '@shared/utils/wav.utils';
import type { LiveStream, LiveText, StreamingEngine } from './streaming';

const joined = (a: string, b: string) => [a, b].filter((t) => t.trim()).join(' ').trim();

function openStream(family: TranscriptionFamily, model: Parameters<typeof createTranscriptionModel>[1]): LiveStream {
  let push: ReadableStreamDefaultController<Uint8Array> | null = null;
  const audio = new ReadableStream<Uint8Array>({ start: (controller) => { push = controller; } });
  const stop = new AbortController();
  const text: LiveText = { committed: '', tentative: '' };
  let failure: unknown = null;
  const { streamingFormat, sampleRate } = TRANSCRIPTION_CONFIG;
  const resample = streamResampler(sampleRate, streamingFormat.rate);
  const result = streamTranscribe({ model: createTranscriptionModel(family, model), audio, inputAudioFormat: streamingFormat, abortSignal: stop.signal });
  // A stretch's words as deltas (OpenAI): added to as they come, shown until the stretch's final text settles it.
  let deltas = { id: undefined as string | undefined, text: '' };
  const reading = (async () => {
    for await (const part of result.fullStream) {
      if (part.type === 'transcript-delta') {
        deltas = { id: part.id, text: (part.id === deltas.id ? deltas.text : '') + part.delta };
        text.tentative = deltas.text.trim();
      }
      if (part.type === 'transcript-partial') text.tentative = part.text;
      if (part.type === 'transcript-final') {
        Object.assign(text, { committed: joined(text.committed, part.text), tentative: '' });
        deltas = { id: undefined, text: '' };
      }
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
      push?.enqueue(samplesToPcm16(resample(pcm)));
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
