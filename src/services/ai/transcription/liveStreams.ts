/** Streaming transcription of one or more sources (dictation: the mic; a meeting: you and the call): one stream per source,
 *  audio fed in order; each stretch of text the model settles becomes a line, and the words it is still revising are reported
 *  until they settle. The one stream-session loop dictation and meetings share. */

import { errorMessage } from '@shared/utils/errors';
import type { LiveStream } from './streaming';

/** A settled stretch of one source's speech, on the recording's clock (ms). */
export interface StreamLine<S extends string> {
  source: S;
  startMs: number;
  endMs: number;
  text: string;
}

/** A piece of one source's audio, on the recording's clock (ms). */
export interface StreamPiece<S extends string> {
  source: S;
  startMs: number;
  endMs: number;
}

/** Where a stream's results go. */
export interface StreamSink<S extends string> {
  line(line: StreamLine<S>): void;
  /** The words still being revised on a source ('' once they settle). */
  partial(source: S, text: string): void;
  fail(reason: string): void;
}

interface SourceStream {
  opening: Promise<LiveStream | null>;
  /** Feeds run one at a time, in order. */
  queue: Promise<void>;
  /** The settled text so far. */
  committed: string;
  /** Where the words not yet settled began, and where the audio fed so far ends (ms on the recording clock). */
  since: number | null;
  endMs: number;
}

export interface LiveStreams<S extends string> {
  feed(piece: StreamPiece<S>, samples: Float32Array): void;
  /** No more audio: each stream's final text is settled. */
  finish(): Promise<void>;
  cancel(): void;
}

export function liveStreams<S extends string>(open: () => Promise<LiveStream>, sink: StreamSink<S>): LiveStreams<S> {
  const sources: Partial<Record<S, SourceStream>> = {};
  const failed = (error: unknown) => sink.fail(errorMessage(error));

  const streamOf = (source: S): SourceStream => (sources[source] ??= {
    opening: open().catch((error: unknown) => {
      failed(error);
      return null;
    }),
    queue: Promise.resolve(),
    committed: '',
    since: null,
    endMs: 0,
  });

  /** The text settled since last time becomes a line spanning the audio it came from. */
  const settle = (source: S, stream: SourceStream, committed: string) => {
    const added = (committed.startsWith(stream.committed) ? committed.slice(stream.committed.length) : committed).trim();
    stream.committed = committed;
    if (!added) return;
    sink.line({ source, startMs: stream.since ?? stream.endMs, endMs: stream.endMs, text: added });
    stream.since = null;
  };

  return {
    feed(piece, samples) {
      const stream = streamOf(piece.source);
      stream.since ??= piece.startMs;
      stream.queue = stream.queue.then(async () => {
        const live = await stream.opening;
        if (!live) return;
        const text = await live.feed(samples);
        stream.endMs = piece.endMs;
        settle(piece.source, stream, text.committed);
        sink.partial(piece.source, text.tentative);
      }).catch(failed);
    },
    async finish() {
      for (const [source, stream] of Object.entries(sources) as [S, SourceStream][]) {
        await stream.queue;
        const live = await stream.opening;
        if (!live) continue;
        await live.finish().then((final) => settle(source, stream, final), failed);
        sink.partial(source, '');
      }
    },
    cancel() {
      (Object.values(sources) as SourceStream[]).forEach((stream) => void stream.opening.then((live) => live?.cancel()).catch(failed));
    },
  };
}
