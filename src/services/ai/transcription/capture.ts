/** Dictation capture behind one interface: record-then-transcribe, or live engine text as it's spoken. */

import { stripNonSpeech } from './format';
import { tapPcm } from './pcmTap';
import type { LiveStream, LiveText } from './streaming';

export interface DictationCapture {
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
 *  revised); the dictation is the engine's final text. The clip is recorded beside it: if the stream is refused or breaks,
 *  `onLost` says so once and `finish` transcribes the clip whole, so nothing said is lost. */
export async function liveCapture(
  stream: MediaStream,
  open: () => Promise<LiveStream>,
  onText: (text: LiveText) => void,
  transcribe: (audio: Blob) => Promise<string>,
  onLost: () => void,
): Promise<DictationCapture> {
  const clip = recordedCapture(stream, transcribe);
  let lost = false;
  let failure: unknown = null;
  const failed = (error: unknown) => {
    if (lost) return;
    lost = true;
    failure = error;
    onLost();
  };
  const engine = open().catch((error: unknown) => {
    failed(error);
    return null;
  });
  // feeds run one at a time, in order
  let feeding = Promise.resolve();
  const tap = await tapPcm(stream, (pcm) => {
    if (lost) return;
    feeding = feeding.then(async () => {
      const live = await engine;
      if (!live || lost) return;
      const text = await live.feed(pcm);
      onText({ committed: text.committed.trimStart(), tentative: text.tentative });
    }).catch(failed);
  });
  /** The engine's final text, or null when the stream failed. */
  const finalText = async (): Promise<string | null> => {
    await feeding;
    const live = await engine;
    if (!live || lost) return null;
    return live.finish().catch((error: unknown) => {
      failed(error);
      return null;
    });
  };
  return {
    finish: async () => {
      tap.stop();
      const text = await finalText();
      if (text === null) {
        console.info('[capture] live dictation fell back to the recorded clip:', failure);
        void engine.then((live) => live?.cancel()).catch((error: unknown) => console.error('[capture] cancel failed:', error));
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
