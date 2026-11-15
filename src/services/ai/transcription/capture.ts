/** Dictation capture behind one interface: record-then-transcribe, or live engine text as it's spoken. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { failureLogger } from '@shared/utils/errors';
import { tapPcm } from './pcmTap';
import type { LiveEngine, LiveText } from './live';

const report = failureLogger('DictationCapture');

export interface DictationCapture {
  pause(): void;
  resume(): void;
  /** Ends capture → the transcript. */
  finish(): Promise<string>;
  /** Ends capture and discards it. */
  cancel(): void;
}

export function recordedCapture(stream: MediaStream, transcribe: (audio: Blob) => Promise<string>): DictationCapture {
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(); // the whole clip arrives when it stops
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  return {
    pause: () => {
      if (recorder.state === 'recording') recorder.pause();
    },
    resume: () => {
      if (recorder.state === 'paused') recorder.resume();
    },
    finish: async () => {
      recorder.stop();
      await stopped;
      return transcribe(new Blob(chunks, { type: recorder.mimeType }));
    },
    cancel: () => {
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

/** Records at once while the engine warms up; audio spoken meanwhile is queued and fed in order when it's ready. */
export async function liveCapture(
  stream: MediaStream,
  engine: LiveEngine,
  model: string,
  onText: (text: LiveText) => void,
): Promise<DictationCapture> {
  let paused = false;
  let failure: unknown = null;
  // Start, then every feed, run one at a time and in order.
  let pending: Promise<void> = engine.start(model, TRANSCRIPTION_CONFIG.language).catch((error: unknown) => {
    failure = error;
    report('start')(error);
  });
  const tap = await tapPcm(stream, (pcm) => {
    if (paused || failure) return;
    pending = pending.then(() => engine.feed(pcm)).then(onText, report('feed'));
  });
  return {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    finish: async () => {
      tap.stop();
      await pending;
      if (failure) throw failure;
      return engine.finish();
    },
    cancel: () => {
      tap.stop();
      pending.then(() => (failure ? undefined : engine.cancel())).catch(report('cancel'));
    },
  };
}
