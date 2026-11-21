/** Dictation capture behind one interface: record-then-transcribe, or live engine text as it's spoken. */

import { stripNonSpeech } from './format';
import { tapPcm } from './pcmTap';
import type { LiveStream, LiveText } from './streaming';

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

/** Feeds the mic to one live stream and shows the engine's own text as it comes (settled words, then the ones still being
 *  revised); the dictation is the engine's final text. The clip is recorded beside it: a stream the model refuses or that
 *  breaks gives way to the clip, transcribed whole, so nothing said is lost. */
export async function liveCapture(
  stream: MediaStream,
  open: () => Promise<LiveStream>,
  onText: (text: LiveText) => void,
  transcribe: (audio: Blob) => Promise<string>,
): Promise<DictationCapture> {
  const clip = recordedCapture(stream, transcribe);
  let paused = false;
  let failure: unknown = null;
  const failed = (error: unknown) => {
    failure ??= error;
  };
  const engine = open().catch((error: unknown) => {
    failed(error);
    return null;
  });
  // feeds run one at a time, in order
  let feeding = Promise.resolve();
  const tap = await tapPcm(stream, (pcm) => {
    if (paused || failure) return;
    feeding = feeding.then(async () => {
      const live = await engine;
      if (!live || failure) return;
      const text = await live.feed(pcm);
      onText({ committed: text.committed.trimStart(), tentative: text.tentative });
    }).catch(failed);
  });
  /** The engine's final text, or null when the stream failed. */
  const finalText = async (): Promise<string | null> => {
    await feeding;
    const live = await engine;
    if (!live || failure) return null;
    return live.finish().catch((error: unknown) => {
      failed(error);
      return null;
    });
  };
  return {
    pause: () => {
      paused = true;
      clip.pause();
    },
    resume: () => {
      paused = false;
      clip.resume();
    },
    finish: async () => {
      tap.stop();
      const text = await finalText();
      if (text === null) {
        console.info('[capture] live dictation fell back to the recorded clip:', failure);
        return clip.finish();
      }
      clip.cancel();
      return stripNonSpeech(text);
    },
    cancel: () => {
      tap.stop();
      clip.cancel();
      void engine.then((live) => live?.cancel()).catch((error: unknown) => console.error('[capture] cancel failed:', error));
    },
  };
}
