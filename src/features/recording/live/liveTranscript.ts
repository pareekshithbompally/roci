/** The in-call transcript: the recording's own audio (mic and system, from Rust) transcribed with the chosen speech model —
 *  streamed when the model streams (frames), otherwise chunk by chunk in order. At Stop its last chunks are finished and,
 *  when nothing was lost, it is the meeting's transcript; a draft with a gap is replaced by the whole recording's. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MEETING_LIVE_CONFIG as LIVE, type MeetingSourceId } from '@config/meetingLive.config';
import { liveStreams, openLiveStream, tryLiveStreams, type LiveStream, type LiveStreams, type StreamLine, type TranscriptResult } from '@services/ai/transcription';
import { readySpeechSelection, transcribeAudio } from '@services/unifiedAIService';
import { errorMessage } from '@shared/utils/errors';
import { encodeWavInt16, pcm16ToSamples } from '@shared/utils/wav.utils';
import type { LiveChunk } from '@shared/types/native';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { draftEntriesOf, meetingLiveActions } from './meetingLiveStore';
import { acceptChunk, finishTrack, newTrack, type TrackTranscript } from './trackTranscript';

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
  /** The next chunk number expected from each source; none until its first chunk (a window reloaded mid-recording joins
   *  a recorder that kept counting). */
  expected: Partial<Record<MeetingSourceId, number>>;
  /** Echo checks of the draft, one after another, so an older verdict never overwrites a newer one. */
  echo: Promise<void>;
  /** Stops the chunk being transcribed when the session ends. */
  controller: AbortController;
  /** Chunks not yet started, in arrival order. */
  waiting: LiveChunk[];
  /** The loop transcribing `waiting` one chunk at a time; null when idle. */
  draining: Promise<void> | null;
  /** A streaming model's streams, one per source; null when the model goes live in chunks. */
  streams: LiveStreams<MeetingSourceId> | null;
  /** The streams opened at Record, each taken by its side's first frame; a window reloaded mid-recording opens its own. */
  opened: Partial<Record<MeetingSourceId, LiveStream>>;
  /** Each side's transcript as its chunks are joined (chunks only; a stream settles its own lines). */
  tracks: Map<MeetingSourceId, TrackTranscript>;
  unlisten: () => void;
  /** Nothing lost: every chunk since the recording began arrived and was transcribed, so the draft can stand as the transcript. */
  complete: boolean;
}

/** What the in-call transcript hands over at Stop: its lines, echo removed, and whether nothing was lost. */
interface LiveDraft {
  entries: LiveEntry[];
  complete: boolean;
}

type Reader = () => { settings: AppSettings; providers: ModelProvider[] };

let session: Session | null = null;
/** Streams opened at Record for the recording about to start; its session takes them. */
let prepared: Partial<Record<MeetingSourceId, LiveStream>> = {};

/** Abandons streams opened but never used (a side that sent no audio, or a Record that failed). */
function cancelStreams(streams: Partial<Record<MeetingSourceId, LiveStream>>): void {
  Object.values(streams).forEach((stream) => void stream?.cancel().catch((error: unknown) => console.error('[liveTranscript] cancel failed:', error)));
}

/** A chunk's or frame's audio (base64 16-bit PCM) as samples. */
const samplesOf = (pcm: string): Float32Array => pcm16ToSamples(Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0)));

const wavOf = (pcm: string): Blob => new Blob([encodeWavInt16(samplesOf(pcm), LIVE.sampleRate)], { type: 'audio/wav' });

/** A chunk was lost: the draft has a gap, which the screen says (with why, when there is something to fix). */
function markFailed(current: Session, reason?: string): void {
  current.complete = false;
  if (session === current) meetingLiveActions.fail(reason);
}

/** Stops a session's work (the chunk in flight, the queue, the streams); what it heard is no longer whole. */
function abandon(current: Session): void {
  current.complete = false;
  current.unlisten();
  current.controller.abort();
  current.waiting = [];
  current.streams?.cancel();
  cancelStreams(current.opened);
}

/** Waits for the session's last words: the queued chunks transcribed, or the streams' final text settled. */
async function settle(current: Session): Promise<void> {
  if (current.streams) return current.streams.finish();
  while (current.draining) await current.draining;
}

/** The draft, echo removed, shown — in order. */
function showDraft(current: Session): void {
  current.echo = current.echo
    .then(() => withoutEcho(current.entries))
    .then((entries) => { if (session === current) meetingLiveActions.set(entries); })
    .catch((error: unknown) => console.error('[liveTranscript] echo check failed:', error));
}

/** Each source's chunks arrive numbered 0, 1, 2…; a number skipped is a chunk this window never got. A window reloaded
 *  mid-recording joins the count without a gap on screen, but its draft misses the start, so it is not whole. */
function checkSequence(current: Session, chunk: LiveChunk): void {
  const expected = current.expected[chunk.source];
  if (expected === undefined && chunk.seq !== 0) current.complete = false;
  if (expected !== undefined && chunk.seq !== expected) markFailed(current);
  current.expected[chunk.source] = chunk.seq + 1;
}

/** A side's transcript, starting from the lines it already has (kept across a reload). */
function trackOf(current: Session, source: MeetingSourceId): TrackTranscript {
  const track = current.tracks.get(source) ?? newTrack(source, current.entries.filter((e) => e.source === source));
  current.tracks.set(source, track);
  return track;
}

/** The session's lines with a side's lines brought up to date. */
function showTrack(current: Session, track: TrackTranscript): void {
  current.entries = [...current.entries.filter((e) => e.source !== track.source), ...track.entries];
}

/** Through the one transcription entry (usage, model checks, cancel), the whole chunk at once; a silent chunk is no lines. */
async function transcribeChunk(current: Session, chunk: LiveChunk, read: Reader): Promise<void> {
  const { settings, providers } = read();
  try {
    const result = await transcribeAudio(wavOf(chunk.pcm), settings, providers, {
      signal: current.controller.signal,
      meetingId: current.meetingId,
      silence: 'empty',
      whole: true,
    });
    if (session !== current) return;
    const track = trackOf(current, chunk.source);
    acceptChunk(track, chunk, result);
    showTrack(current, track);
    showDraft(current);
  } catch (error: unknown) {
    if (current.controller.signal.aborted) return;
    console.error('[liveTranscript] chunk failed:', error);
    markFailed(current, errorMessage(error));
  }
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
    await transcribeChunk(current, chunk, read);
  }
  current.draining = null;
}

function enqueue(current: Session, chunk: LiveChunk, read: Reader): void {
  checkSequence(current, chunk);
  if (current.streams) return current.streams.feed(chunk, samplesOf(chunk.pcm));
  const { kept, shed } = shedBacklog([...current.waiting, chunk]);
  current.waiting = kept;
  if (shed > 0) markFailed(current);
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

/** A side's stream: the one opened at Record, else a new one for the chosen speech model, checked like any transcription. */
async function openStream(current: Session, read: Reader, side: MeetingSourceId): Promise<LiveStream> {
  const ready = current.opened[side];
  delete current.opened[side];
  if (ready) return ready;
  const { settings, providers } = read();
  return openLiveStream(readySpeechSelection(settings), providers);
}

/** A stream's lines join the session's draft (echo removed) the same way chunk results do. */
function streamSink(current: Session) {
  return {
    line(line: StreamLine<MeetingSourceId>) {
      current.entries.push({ ...line, timed: false });
      showDraft(current);
    },
    partial(source: MeetingSourceId, text: string) {
      if (session === current) meetingLiveActions.partial(source, text);
    },
    fail: (reason: string) => markFailed(current, reason),
  };
}

export const liveTranscript = {
  /** Before Record: tries real-time for each side the recording will capture. True when every side's stream was taken (the
   *  recorder then sends frames); false and nothing kept when the model or its engine can't (the recorder sends chunks). */
  async prepare(read: Reader, sides: readonly MeetingSourceId[]): Promise<boolean> {
    cancelStreams(prepared);
    prepared = {};
    const { settings, providers } = read();
    const streams = await Promise.resolve()
      .then(() => tryLiveStreams(readySpeechSelection(settings), providers, sides.length))
      .catch((error: unknown) => {
        console.info('[liveTranscript] real-time unavailable, going live in chunks:', error);
        return null;
      });
    if (!streams) return false;
    prepared = Object.fromEntries(sides.map((side, i) => [side, streams[i]]));
    return true;
  },

  /** Record failed: the streams opened for it are closed. */
  release(): void {
    cancelStreams(prepared);
    prepared = {};
  },

  /** Starts listening for a recording's audio — frames for a model that streams (`streaming`, as the recorder reports it),
   *  chunks otherwise; any earlier session (an abandoned recording) is dropped. The same recording again (Real-time
   *  transcription turned off and on) keeps the session it has, and its draft. */
  async start(meetingId: string, read: Reader, streaming = false): Promise<void> {
    if (session?.meetingId === meetingId) return;
    if (session) abandon(session);
    meetingLiveActions.start(meetingId);
    // after a reload mid-recording the kept lines carry on; the chunks missed meanwhile leave the draft not whole
    const current: Session = {
      meetingId, entries: [...draftEntriesOf(meetingId)], expected: {}, echo: Promise.resolve(), controller: new AbortController(),
      waiting: [], draining: null, streams: null, opened: prepared, tracks: new Map(), unlisten: () => undefined, complete: true,
    };
    prepared = {};
    if (streaming) current.streams = liveStreams((side) => openStream(current, read, side), streamSink(current));
    session = current;
    current.unlisten = await listen<LiveChunk>(LIVE.chunkEvent, ({ payload }) => enqueue(current, payload, read));
  },

  /** Whether a recording's in-call transcript is running (its chunks still arriving or being transcribed). */
  active(meetingId: string): boolean {
    return session?.meetingId === meetingId;
  },

  /** After Stop (Rust has sent the last chunks before Stop returns): the queued chunks are transcribed or the streams
   *  finished, then the draft is handed over, echo removed, and stays on screen. `signal` stops the wait, leaving the draft
   *  not whole. Only this meeting's session is touched, never a newer one; null when it has none. */
  async finish(meetingId: string, signal?: AbortSignal): Promise<LiveDraft | null> {
    const current = session;
    if (!current || current.meetingId !== meetingId) return null;
    const stop = () => abandon(current);
    signal?.addEventListener('abort', stop, { once: true });
    await settle(current).finally(() => signal?.removeEventListener('abort', stop));
    current.unlisten();
    cancelStreams(current.opened);
    for (const track of current.tracks.values()) {
      finishTrack(track);
      showTrack(current, track);
    }
    const entries = await withoutEcho(current.entries);
    if (session === current) {
      session = null;
      meetingLiveActions.set(entries);
      meetingLiveActions.end();
    }
    return { entries, complete: current.complete };
  },
};
