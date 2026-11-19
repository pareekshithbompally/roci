/** Dictation capture behind one interface: record-then-transcribe, or live engine text as it's spoken. */

import { stripNonSpeech } from './format';
import { failureLogger } from '@shared/utils/errors';
import { tapPcm } from './pcmTap';
import type { LiveStream, LiveText } from './streaming';

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
      return stripNonSpeech(await transcribe(new Blob(chunks, { type: recorder.mimeType })));
    },
    cancel: () => {
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

/** Records at once while the stream opens; audio spoken meanwhile is queued and fed in order when it's ready. */
export async function liveCapture(
  stream: MediaStream,
  open: () => Promise<LiveStream>,
  onText: (text: LiveText) => void,
): Promise<DictationCapture> {
  let paused = false;
  let failure: unknown = null;
  let live: LiveStream | null = null;
  // Opening, then every feed, run one at a time and in order.
  let pending: Promise<void> = open().then((opened) => { live = opened; }).catch((error: unknown) => {
    failure = error;
    report('start')(error);
  });
  const tap = await tapPcm(stream, (pcm) => {
    if (paused || failure) return;
    pending = pending.then(() => live?.feed(pcm)).then((text) => text && onText(text), report('feed'));
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
      if (failure || !live) throw failure ?? new Error('Live transcription did not start.');
      return stripNonSpeech(await (live as LiveStream).finish());
    },
    cancel: () => {
      tap.stop();
      pending.then(() => (live as LiveStream | null)?.cancel()).catch(report('cancel'));
    },
  };
}
