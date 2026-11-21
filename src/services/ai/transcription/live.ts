/** Live transcription, one rule: try real-time, and go live in chunks (about eight seconds behind) when it can't. A model's
 *  engine says how many streams it runs at once (dictation needs 1; a meeting one per side); the model says, by taking or
 *  refusing the stream, whether it streams. */

import type { ModelProvider } from '@shared/types/modelProviders';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { toAiError } from '@services/ai/errors';
import { adapterFor } from './catalog';
import { speechModelFor } from './pipeline';
import { STREAMING, type LiveStream } from './streaming';
import type { SpeechSelection } from './types';

/** Whether the selection's engine runs `count` streams at once — worth trying real-time. */
export function runsLive(selection: SpeechSelection, providers: ModelProvider[], count: number): boolean {
  const engine = STREAMING[adapterFor(selection, providers) ?? 'multimodal'];
  return !!engine && engine.concurrent >= count;
}

/** Opens `count` streams, or none: null when the engine can't run that many or the model refuses (the reason is logged), so
 *  the caller goes live in chunks. */
export async function tryLiveStreams(selection: SpeechSelection, providers: ModelProvider[], count: number): Promise<LiveStream[] | null> {
  if (!runsLive(selection, providers, count)) return null;
  const opened = await Promise.allSettled(Array.from({ length: count }, () => openLiveStream(selection, providers)));
  const streams = opened.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
  if (streams.length === count) return streams;
  console.info('[live] real-time refused, going live in chunks:', opened.find((o) => o.status === 'rejected')?.reason);
  await Promise.allSettled(streams.map((s) => s.cancel()));
  return null;
}

/** A stream whose failures read as one plain sentence (the one AI error translator), whatever the engine. */
function translated(stream: LiveStream, provider: string): LiveStream {
  const plain = (error: unknown): never => {
    throw toAiError(error, 'speech', provider);
  };
  return {
    feed: (pcm) => stream.feed(pcm).catch(plain),
    finish: () => stream.finish().catch(plain),
    cancel: () => stream.cancel(),
  };
}

/** Opens one stream; rejects when the model can't stream. Its failures, opening or later, read as plain sentences. */
export async function openLiveStream(selection: SpeechSelection, providers: ModelProvider[]): Promise<LiveStream> {
  try {
    const engine = STREAMING[adapterFor(selection, providers) ?? 'multimodal'];
    if (!engine) throw new Error(`${selection.model} doesn't stream.`);
    const { model, resolved } = await speechModelFor(selection, providers);
    return translated(await engine.open({ model, resolved, language: TRANSCRIPTION_CONFIG.language }), selection.provider);
  } catch (error: unknown) {
    throw toAiError(error, 'speech', selection.provider);
  }
}
