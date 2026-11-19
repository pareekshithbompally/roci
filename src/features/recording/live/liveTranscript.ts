/** The in-call transcript: the recording's own chunks (mic and system audio, from Rust) transcribed in order with the chosen
 *  speech model; on Stop it becomes the meeting's transcript when every chunk was transcribed. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MEETING_LIVE_CONFIG as LIVE, type MeetingSourceId } from '@config/meetingLive.config';
import type { TranscriptResult } from '@services/ai/transcription';
import { transcribeAudio } from '@services/unifiedAIService';
import { errorMessage } from '@shared/utils/errors';
import { encodeWavInt16 } from '@shared/utils/wav.utils';
import type { LiveChunk, LiveDone } from '@shared/types/native';
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

interface Session {
  meetingId: string;
  entries: LiveEntry[];
  /** A chunk failed, was shed or never arrived: the in-call transcript is incomplete, so the recording is transcribed after Stop. */
  failed: boolean;
  /** The next chunk number expected from each source. */
  expected: Record<MeetingSourceId, number>;
  /** Stops the chunk being transcribed when the session is dropped. */
  controller: AbortController;
  /** Chunks not yet started, in arrival order. */
  waiting: LiveChunk[];
  /** The loop transcribing `waiting` one chunk at a time; null when idle. */
  draining: Promise<void> | null;
  done: Promise<void>;
  unlisten: () => void;
}

type Reader = () => { settings: AppSettings; providers: ModelProvider[] };

let session: Session | null = null;

function wavOf(pcm: string): Blob {
  const bytes = Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const samples = Float32Array.from(ints, (s) => s / 32_768);
  return new Blob([encodeWavInt16(samples, LIVE.sampleRate)], { type: 'audio/wav' });
}

/** A chunk was lost: the in-call transcript has a gap, which the screen says (with why, when there is a reason to fix) and the
 *  pipeline repairs after Stop. */
function markFailed(current: Session, reason?: string): void {
  current.failed = true;
  if (session === current) meetingLiveActions.fail(reason);
}

/** Each source's chunks arrive numbered 0, 1, 2…; a number skipped is a chunk this window never got. */
function checkSequence(current: Session, chunk: LiveChunk): void {
  if (chunk.seq !== current.expected[chunk.source]) markFailed(current);
  current.expected[chunk.source] = chunk.seq + 1;
}

/** The end: a source that sent more than arrived lost its last chunks. */
function checkTotals(current: Session, sent: LiveDone | null): void {
  const lost = (['microphone', 'system'] as const).some((source) => (sent?.[source] ?? 0) !== current.expected[source]);
  if (lost) markFailed(current);
}

/** Through the one transcription entry (usage, model checks, cancel); a silent chunk is simply no lines. */
async function transcribeChunk(current: Session, chunk: LiveChunk, read: Reader): Promise<void> {
  const { settings, providers } = read();
  try {
    const result = await transcribeAudio(wavOf(chunk.pcm), settings, providers, {
      signal: current.controller.signal,
      meetingId: current.meetingId,
      silence: 'empty',
    });
    if (session !== current) return;
    current.entries.push(...spliceChunk(current.entries, chunk, chunkEntries(chunk, result)));
    meetingLiveActions.set(await withoutEcho(current.entries));
  } catch (error: unknown) {
    if (current.controller.signal.aborted) return;
    console.error('[liveTranscript] chunk failed:', error);
    markFailed(current, errorMessage(error));
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
  checkSequence(current, chunk);
  const { kept, shed } = shedBacklog([...current.waiting, chunk]);
  current.waiting = kept;
  if (shed > 0) current.failed = true;
  current.draining ??= drain(current, read);
}

/** What the recording's sound says about a microphone span: bleed of the system audio, local speech, or undecided. */
type EchoSignal = 'bleed' | 'local' | null;
type SignalOf = (startMs: number, endMs: number) => EchoSignal;

const tokens = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function editDistance(left: string[], right: string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let row = 0; row < left.length; row++) {
    const current = [row + 1];
    for (let column = 0; column < right.length; column++) {
      current.push(Math.min(previous[column] + Number(left[row] !== right[column]), previous[column + 1] + 1, current[column] + 1));
    }
    previous = current;
  }
  return previous[right.length];
}

/** Two words are one when equal, or (three letters or more) nearly so. */
function tokensMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 3 || right.length < 3) return false;
  return 1 - editDistance([...left], [...right]) / Math.max(left.length, right.length) >= LIVE.echo.similarity;
}

/** The share of `spoken` that the other side's speech around it contains. */
function echoScore(spoken: string[], startMs: number, endMs: number, system: LiveEntry[]): number {
  const from = startMs - LIVE.echo.windowMs;
  const to = endMs + LIVE.echo.windowMs;
  const remote = system.filter((e) => e.startMs < to && from < e.endMs).flatMap((e) => tokens(e.text));
  if (remote.length === 0 || spoken.length === 0) return 0;
  return spoken.filter((t) => remote.some((r) => tokensMatch(t, r))).length / spoken.length;
}

/** Microphone entries split into utterances: entries closer than the utterance gap belong together. */
function utterancesOf(entries: LiveEntry[]): LiveEntry[][] {
  return entries
    .filter((e) => e.source === 'microphone')
    .sort((a, b) => a.startMs - b.startMs)
    .reduce<LiveEntry[][]>((all, entry) => {
      const last = all.at(-1);
      if (last && entry.startMs - (last.at(-1)?.endMs ?? 0) <= LIVE.echo.utteranceGapMs) last.push(entry);
      else all.push([entry]);
      return all;
    }, []);
}

/** The microphone entries that echo the other side: the sound decides (bleed drops, local keeps); undecided, the words do. */
function echoedEntries(entries: LiveEntry[], signal: SignalOf): Set<LiveEntry> {
  const system = entries.filter((e) => e.source === 'system');
  const isEcho = (spoken: string[], startMs: number, endMs: number, judgeWords: boolean) => {
    const verdict = signal(startMs, endMs);
    if (verdict) return verdict === 'bleed';
    return judgeWords && echoScore(spoken, startMs, endMs, system) >= LIVE.echo.similarity;
  };
  const echoed = new Set<LiveEntry>();
  for (const utterance of utterancesOf(entries)) {
    const end = Math.max(...utterance.map((e) => e.endMs));
    if (isEcho(utterance.flatMap((e) => tokens(e.text)), utterance[0].startMs, end, true)) {
      // Bleed can run into the user's own sentence; a sentence the sound shows is local survives its echoing neighbours.
      utterance.filter((e) => tokens(e.text).length < LIVE.echo.sentenceWords || signal(e.startMs, e.endMs) !== 'local').forEach((e) => echoed.add(e));
    } else if (utterance.length > 1) {
      utterance.filter((e) => { const spoken = tokens(e.text); return isEcho(spoken, e.startMs, e.endMs, spoken.length >= LIVE.echo.sentenceWords); }).forEach((e) => echoed.add(e));
    }
  }
  return echoed;
}

/** Entries in time order without the microphone's echo of what the speakers played. */
export function suppressEcho(entries: LiveEntry[], signal: SignalOf): LiveEntry[] {
  const echoed = echoedEntries(entries, signal);
  return entries.filter((e) => !echoed.has(e)).sort((a, b) => a.startMs - b.startMs);
}

/** The same, with the recording's sound asked once for every span it needs; words alone when the sound can't be read. */
export async function withoutEcho(entries: LiveEntry[]): Promise<LiveEntry[]> {
  const spans = [...utterancesOf(entries).map((u) => [u[0].startMs, Math.max(...u.map((e) => e.endMs))]), ...entries.filter((e) => e.source === 'microphone').map((e) => [e.startMs, e.endMs])]
    .map(([start, end]) => [Math.round(start), Math.round(end)] as [number, number]);
  const verdicts = await invoke<EchoSignal[]>('meeting_echo_signals', { spans }).catch((error: unknown) => {
    console.error('[liveTranscript] echo signals unavailable:', error);
    return [] as EchoSignal[];
  });
  const byspan = new Map(spans.map(([start, end], i) => [`${start}-${end}`, verdicts[i] ?? null]));
  return suppressEcho(entries, (start, end) => byspan.get(`${Math.round(start)}-${Math.round(end)}`) ?? null);
}

/** The entries as a transcript: one segment per entry, labelled by who said it. */
export function liveTranscriptResult(entries: LiveEntry[]): TranscriptResult {
  const segments = entries.map((e) => ({ text: e.text, startSecond: e.startMs / 1_000, endSecond: e.endMs / 1_000, speaker: LIVE.speakers[e.source] }));
  return { text: segments.map((s) => s.text).join(' '), segments };
}

/** The recorder's end-of-chunks, or — if it never comes — the deadline after Stop, past which the in-call transcript counts as
 *  incomplete (the recording is transcribed instead). One timer, cleared when the end arrives. */
async function untilDoneOrTimeout(current: Session): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      markFailed(current);
      resolve();
    }, LIVE.doneTimeoutMs);
  });
  await Promise.race([current.done, timedOut]);
  clearTimeout(timer);
}

export const liveTranscript = {
  /** Starts listening for a recording's chunks; any earlier session (an abandoned recording) is dropped. */
  async start(meetingId: string, read: Reader): Promise<void> {
    session?.unlisten();
    session?.controller.abort();
    meetingLiveActions.start(meetingId);
    let finished: () => void = () => undefined;
    const current: Session = {
      meetingId, entries: [], failed: false, expected: { microphone: 0, system: 0 }, controller: new AbortController(),
      waiting: [], draining: null, done: new Promise((r) => { finished = r; }), unlisten: () => undefined,
    };
    session = current;
    const offChunk = await listen<LiveChunk>(LIVE.chunkEvent, ({ payload }) => enqueue(current, payload, read));
    const offDone = await listen<LiveDone | null>(LIVE.doneEvent, ({ payload }) => {
      checkTotals(current, payload);
      finished();
    });
    current.unlisten = () => { offChunk(); offDone(); };
  },

  /** Whether a recording's in-call transcript is running (its chunks still arriving or being transcribed). */
  active(meetingId: string): boolean {
    return session?.meetingId === meetingId;
  },

  /** After Stop: waits for the last chunks to land in the draft (the store keeps it on screen); nothing when it had no session. */
  async finish(meetingId: string): Promise<void> {
    const current = session;
    if (!current || current.meetingId !== meetingId) return;
    await untilDoneOrTimeout(current);
    while (current.draining) await current.draining;
    current.unlisten();
    session = null;
    meetingLiveActions.end();
  },
};
