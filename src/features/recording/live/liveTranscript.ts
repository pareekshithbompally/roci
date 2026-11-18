/** The in-call transcript: the recording's own chunks (mic and system audio, from Rust) transcribed in order with the chosen
 *  speech model; on Stop it becomes the meeting's transcript when every chunk was transcribed. */

import { listen } from '@tauri-apps/api/event';
import { MEETING_LIVE_CONFIG as LIVE, type MeetingSourceId } from '@config/meetingLive.config';
import { runTranscription, speechSelectionOf } from '@services/ai/transcription';
import type { TranscriptResult } from '@services/ai/transcription';
import { encodeWavInt16 } from '@shared/utils/wav.utils';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { meetingLiveActions } from './meetingLiveStore';

/** One transcribed chunk of one source, on the recording's timeline. */
export interface LiveEntry {
  source: MeetingSourceId;
  startMs: number;
  endMs: number;
  text: string;
  /** The model gave this line's own times; otherwise it spans its chunk and shows no time of its own. */
  timed: boolean;
}

interface LiveChunk {
  source: MeetingSourceId;
  startMs: number;
  endMs: number;
  /** Leading audio the previous chunk already covered (a hard cut); its words are spliced away at the seam. */
  overlapMs: number;
  pcm: string;
}

interface Session {
  meetingId: string;
  entries: LiveEntry[];
  /** A chunk failed or was shed: the in-call transcript is incomplete, so the recording is transcribed after Stop. */
  failed: boolean;
  /** Chunks not yet started, in arrival order. */
  waiting: LiveChunk[];
  /** The loop transcribing `waiting` one chunk at a time; null when idle. */
  draining: Promise<void> | null;
  done: Promise<void>;
  unlisten: () => void;
}

type Reader = () => { settings: AppSettings; providers: ModelProvider[] };

/** What the recording left: its entries, and whether every chunk was transcribed. */
export interface LiveOutcome {
  entries: LiveEntry[];
  complete: boolean;
}

let session: Session | null = null;

function wavOf(pcm: string): Blob {
  const bytes = Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const samples = Float32Array.from(ints, (s) => s / 32_768);
  return new Blob([encodeWavInt16(samples, LIVE.sampleRate)], { type: 'audio/wav' });
}

async function transcribeChunk(current: Session, chunk: LiveChunk, read: Reader): Promise<void> {
  const { settings, providers } = read();
  const selection = speechSelectionOf(settings);
  if (!selection) {
    current.failed = true;
    return;
  }
  try {
    const result = await runTranscription(wavOf(chunk.pcm), selection, providers);
    if (session !== current) return;
    current.entries.push(...spliceChunk(current.entries, chunk, chunkEntries(chunk, result)));
    meetingLiveActions.set(dropEchoes(current.entries));
  } catch (error: unknown) {
    console.error('[liveTranscript] chunk failed:', error);
    current.failed = true;
  }
}

/** A chunk's lines on the recording's timeline: the model's own segment times when it gives them, else one line spanning the chunk. */
export function chunkEntries(chunk: Pick<LiveChunk, 'source' | 'startMs' | 'endMs'>, result: TranscriptResult): LiveEntry[] {
  const { source, startMs, endMs } = chunk;
  const segments = result.segments.filter((s) => s.text.trim());
  if (segments.length > 0) {
    return segments.map((s) => ({ source, startMs: startMs + s.startSecond * 1_000, endMs: startMs + s.endSecond * 1_000, text: s.text.trim(), timed: true }));
  }
  const text = result.text.trim();
  return text ? [{ source, startMs, endMs, text, timed: false }] : [];
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const norm = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** The words of `next` that repeat the end of `previous` (re-heard overlap), dropped: the longest run of up to SEAM_MAX_WORDS
 *  words ending `previous` found within the first SEAM_SLACK words of `next`. */
export function spliceSeam(previous: string, next: string): string {
  const before = wordsOf(previous).map(norm);
  const after = wordsOf(next);
  const afterNorm = after.map(norm);
  for (let run = Math.min(LIVE.seam.maxWords, before.length, after.length); run >= LIVE.seam.minWords; run--) {
    const tail = before.slice(-run).join(' ');
    for (let at = 0; at <= LIVE.seam.slack && at + run <= after.length; at++) {
      if (afterNorm.slice(at, at + run).join(' ') === tail) return after.slice(at + run).join(' ');
    }
  }
  return next;
}

/** A chunk's lines after its overlap: the first line loses the words the previous line of its source already has. */
function spliceChunk(entries: LiveEntry[], chunk: LiveChunk, lines: LiveEntry[]): LiveEntry[] {
  const previous = chunk.overlapMs > 0 ? entries.filter((e) => e.source === chunk.source).at(-1) : undefined;
  if (!previous || lines.length === 0) return lines;
  const [first, ...rest] = lines;
  const text = spliceSeam(previous.text, first.text);
  return text ? [{ ...first, text }, ...rest] : rest;
}

/** Falling behind (a model slower than the meeting): a source with more than the backlog limit waiting drops its oldest chunks,
 *  so the live text catches up; the recording is then transcribed after Stop, so nothing is missing from the final transcript. */
export function shedBacklog(waiting: LiveChunk[]): { kept: LiveChunk[]; shed: number } {
  const kept = [...waiting];
  const backlog = (source: MeetingSourceId) => kept.filter((c) => c.source === source).reduce((ms, c) => ms + c.endMs - c.startMs, 0);
  let shed = 0;
  for (const source of ['microphone', 'system'] as const) {
    while (backlog(source) > LIVE.maxBacklogMs) {
      kept.splice(kept.findIndex((c) => c.source === source), 1);
      shed++;
    }
  }
  return { kept, shed };
}

async function drain(current: Session, read: Reader): Promise<void> {
  for (let chunk = current.waiting.shift(); chunk; chunk = current.waiting.shift()) {
    meetingLiveActions.pending(current.waiting.length + 1);
    await transcribeChunk(current, chunk, read);
  }
  meetingLiveActions.pending(0);
  current.draining = null;
}

function enqueue(current: Session, chunk: LiveChunk, read: Reader): void {
  const { kept, shed } = shedBacklog([...current.waiting, chunk]);
  current.waiting = kept;
  if (shed > 0) current.failed = true;
  current.draining ??= drain(current, read);
}

/** Entries in time order, without the microphone's echo of what the speakers played. */
export function dropEchoes(entries: LiveEntry[]): LiveEntry[] {
  const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  const system = entries.filter((e) => e.source === 'system');
  const isEcho = (mic: LiveEntry) => {
    const said = words(mic.text);
    return said.size > 0 && system.some((s) => s.startMs < mic.endMs && mic.startMs < s.endMs
      && [...said].filter((w) => words(s.text).has(w)).length / said.size >= LIVE.echoWordShare);
  };
  return entries.filter((e) => e.source !== 'microphone' || !isEcho(e)).sort((a, b) => a.startMs - b.startMs);
}

/** The entries as a transcript: one segment per entry, labelled by who said it. */
export function liveTranscriptResult(entries: LiveEntry[]): TranscriptResult {
  const segments = entries.map((e) => ({ text: e.text, startSecond: e.startMs / 1_000, endSecond: e.endMs / 1_000, speaker: LIVE.speakers[e.source] }));
  return { text: segments.map((s) => s.text).join(' '), segments };
}

export const liveTranscript = {
  /** Starts listening for a recording's chunks; any earlier session (an abandoned recording) is dropped. */
  async start(meetingId: string, read: Reader): Promise<void> {
    session?.unlisten();
    meetingLiveActions.start(meetingId);
    let finished: () => void = () => undefined;
    const current: Session = { meetingId, entries: [], failed: false, waiting: [], draining: null, done: new Promise((r) => { finished = r; }), unlisten: () => undefined };
    session = current;
    const offChunk = await listen<LiveChunk>(LIVE.chunkEvent, ({ payload }) => enqueue(current, payload, read));
    const offDone = await listen(LIVE.doneEvent, () => finished());
    current.unlisten = () => { offChunk(); offDone(); };
  },

  /** After Stop: waits for the last chunks, then gives the recording's entries (null when it had no session). */
  async finish(meetingId: string): Promise<LiveOutcome | null> {
    const current = session;
    if (!current || current.meetingId !== meetingId) return null;
    await current.done;
    while (current.draining) await current.draining;
    current.unlisten();
    session = null;
    meetingLiveActions.stop();
    return { entries: dropEchoes(current.entries), complete: !current.failed };
  },
};
