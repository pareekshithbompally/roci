/** A streaming meeting's in-call transcript: one stream per source (you, the call), its frames fed in order; each stretch of
 *  text the model settles becomes a line, and the words it is still revising are shown until they settle. */

import type { MeetingSourceId } from '@config/meetingLive.config';
import type { LiveStream } from '@services/ai/transcription';
import type { LiveChunk } from '@shared/types/native';
import { errorMessage } from '@shared/utils/errors';
import type { LiveEntry } from './liveTranscript';

/** Where a stream's results go. */
export interface StreamSink {
  line(entry: LiveEntry): void;
  /** The words still being revised on a source ('' once they settle). */
  partial(source: MeetingSourceId, text: string): void;
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

export interface LiveStreams {
  feed(frame: LiveChunk, samples: Float32Array): void;
  /** No more audio: each stream's final text is settled. */
  finish(): Promise<void>;
  cancel(): void;
}

export function liveStreams(open: () => Promise<LiveStream>, sink: StreamSink): LiveStreams {
  const sources: Partial<Record<MeetingSourceId, SourceStream>> = {};
  const failed = (error: unknown) => sink.fail(errorMessage(error));

  const streamOf = (source: MeetingSourceId): SourceStream => (sources[source] ??= {
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
  const settle = (source: MeetingSourceId, stream: SourceStream, committed: string) => {
    const added = (committed.startsWith(stream.committed) ? committed.slice(stream.committed.length) : committed).trim();
    stream.committed = committed;
    if (!added) return;
    sink.line({ source, startMs: stream.since ?? stream.endMs, endMs: stream.endMs, text: added, timed: false });
    stream.since = null;
  };

  return {
    feed(frame, samples) {
      const stream = streamOf(frame.source);
      stream.since ??= frame.startMs;
      stream.queue = stream.queue.then(async () => {
        const live = await stream.opening;
        if (!live) return;
        const text = await live.feed(samples);
        stream.endMs = frame.endMs;
        settle(frame.source, stream, text.committed);
        sink.partial(frame.source, text.tentative);
      }).catch(failed);
    },
    async finish() {
      for (const [source, stream] of Object.entries(sources) as [MeetingSourceId, SourceStream][]) {
        await stream.queue;
        const live = await stream.opening;
        if (!live) continue;
        await live.finish().then((final) => settle(source, stream, final), failed);
        sink.partial(source, '');
      }
    },
    cancel() {
      Object.values(sources).forEach((stream) => void stream.opening.then((live) => live?.cancel()).catch(failed));
    },
  };
}
