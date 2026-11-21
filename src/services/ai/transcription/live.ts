/** Live transcription, one rule: try real-time, and go live in chunks (about eight seconds behind) when it can't. A model's
 *  engine says how many streams it runs at once (dictation needs 1; a meeting one per side); the model says, by taking or
 *  refusing the stream, whether it streams. */

import type { ModelProvider } from '@shared/types/modelProviders';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { savedTerms } from '@shared/utils/personalization';
import { toAiError } from '@services/ai/errors';
import { recordUsage } from '@extensions/usage';
import { adapterFor } from './catalog';
import { speechModelFor } from './pipeline';
import { STREAMING, type LiveStream } from './streaming';
import type { SpeechSelection } from './types';

/** Whether the selection's engine runs `count` streams at once — worth trying real-time. */
export function runsLive(selection: SpeechSelection, providers: ModelProvider[], count: number): boolean {
  const engine = STREAMING[adapterFor(selection, providers) ?? 'multimodal'];
  return !!engine && engine.concurrent >= count;
}

/** Which meeting a stream's usage belongs to, read when the stream ends (none for dictation). */
type SessionOf = () => string | undefined;

/** Opens `count` streams, or none: null when the engine can't run that many or the model refuses (the reason is logged), so
 *  the caller goes live in chunks. */
export async function tryLiveStreams(selection: SpeechSelection, providers: ModelProvider[], count: number, sessionOf?: SessionOf): Promise<LiveStream[] | null> {
  if (!runsLive(selection, providers, count)) return null;
  const opened = await Promise.allSettled(Array.from({ length: count }, () => openLiveStream(selection, providers, sessionOf)));
  const streams = opened.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
  if (streams.length === count) return streams;
  console.info('[live] real-time refused, going live in chunks:', opened.find((o) => o.status === 'rejected')?.reason);
  await Promise.allSettled(streams.map((s) => s.cancel()));
  return null;
}

/** A stream as every engine's is used: failures read as one plain sentence (the one AI error translator), and the audio it
 *  heard is recorded once, when it ends, for its meeting. */
function tracked(stream: LiveStream, selection: SpeechSelection, sessionOf?: SessionOf): LiveStream {
  const plain = (error: unknown): never => {
    throw toAiError(error, 'speech', selection.provider);
  };
  let heardSeconds = 0;
  let recorded = false;
  const record = () => {
    if (recorded || heardSeconds === 0) return;
    recorded = true;
    recordUsage('transcription', { provider: selection.provider, modelId: selection.model }, undefined, sessionOf?.(), heardSeconds);
  };
  return {
    feed: (pcm) => {
      heardSeconds += pcm.length / TRANSCRIPTION_CONFIG.sampleRate;
      return stream.feed(pcm).catch(plain);
    },
    finish: () => stream.finish().catch(plain).finally(record),
    cancel: () => stream.cancel().finally(record),
  };
}

/** Opens one stream; rejects when the model can't stream. Its failures, opening or later, read as plain sentences, and the
 *  audio it hears is recorded as usage when it ends. */
export async function openLiveStream(selection: SpeechSelection, providers: ModelProvider[], sessionOf?: SessionOf): Promise<LiveStream> {
  try {
    const engine = STREAMING[adapterFor(selection, providers) ?? 'multimodal'];
    if (!engine) throw new Error(`${selection.model} doesn't stream.`);
    const { model, resolved } = await speechModelFor(selection, providers);
    return tracked(await engine.open({ model, resolved, language: TRANSCRIPTION_CONFIG.language, terms: savedTerms() }), selection, sessionOf);
  } catch (error: unknown) {
    throw toAiError(error, 'speech', selection.provider);
  }
}
