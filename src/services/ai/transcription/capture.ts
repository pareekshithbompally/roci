/** Dictation capture behind one interface: record-then-transcribe, or live engine text as it's spoken. */

import { stripNonSpeech } from './format';
import { tapPcm } from './pcmTap';
import type { LiveStream, LiveText } from './streaming';
import { liveStreams } from './liveStreams';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

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

/** Streams the mic through the one stream loop (liveStreams), reporting the settled words and the ones still being revised as
 *  they come, and records the clip beside it: a stream the model refuses or that breaks gives way to the clip, transcribed
 *  whole, so nothing said is lost. */
export async function liveCapture(
  stream: MediaStream,
  open: () => Promise<LiveStream>,
  onText: (text: LiveText) => void,
  transcribe: (audio: Blob) => Promise<string>,
): Promise<DictationCapture> {
  const clip = recordedCapture(stream, transcribe);
  let paused = false;
  let failure: string | null = null;
  const text: LiveText = { committed: '', tentative: '' };
  const show = () => onText({ ...text });
  const mic = liveStreams<'mic'>(open, {
    line: (line) => { text.committed = [text.committed, line.text].filter(Boolean).join(' '); show(); },
    partial: (_source, tentative) => { text.tentative = tentative; show(); },
    fail: (reason) => { failure ??= reason; },
  });
  let heardMs = 0;
  const tap = await tapPcm(stream, (pcm) => {
    if (paused || failure) return;
    const endMs = heardMs + (pcm.length * 1_000) / TRANSCRIPTION_CONFIG.sampleRate;
    mic.feed({ source: 'mic', startMs: heardMs, endMs }, pcm);
    heardMs = endMs;
  });
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
      await mic.finish();
      if (failure) {
        console.info('[capture] live dictation fell back to the recorded clip:', failure);
        return clip.finish();
      }
      clip.cancel();
      return stripNonSpeech(text.committed);
    },
    cancel: () => {
      tap.stop();
      mic.cancel();
      clip.cancel();
    },
  };
}
