/** One side's in-call transcript, built chunk by chunk: a chunk's timed words join the side's open words at its overlap, word by
 *  word, and sentences no later chunk can change become lines; a model without word times gives its segments as lines, joined
 *  at the overlap by its repeated words. */

import { MEETING_LIVE_CONFIG as LIVE, type MeetingSourceId } from '@config/meetingLive.config';
import type { TranscriptResult, TranscriptSegment } from '@services/ai/transcription';
import type { LiveChunk } from '@shared/types/native';
import type { LiveEntry } from './liveTranscript';

/** A word on the recording's clock (ms). */
interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TrackTranscript {
  source: MeetingSourceId;
  /** The lines no later chunk changes. */
  entries: LiveEntry[];
  /** Words of a sentence the next chunk can still change: one that runs into its overlap. */
  words: Word[];
  /** Recording time before which lines are final. */
  settledMs: number;
}

type ChunkSpan = Pick<LiveChunk, 'startMs' | 'endMs' | 'overlapMs' | 'tailMs'>;

const { maxWords, minWords, anchorMs, sentencePauseMs } = LIVE.seam;
const SENTENCE_END = /[.?!]$/;

export function newTrack(source: MeetingSourceId, entries: LiveEntry[]): TrackTranscript {
  return { source, entries, words: [], settledMs: Math.max(0, ...entries.map((e) => e.endMs)) };
}

const normalizeWord = (word: string): string => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** How many words (two to twelve) at the start of `next` repeat the end of `previous`. */
function repeatedPrefix(previous: string[], next: string[]): number {
  for (let count = Math.min(previous.length, next.length, maxWords); count >= minWords; count--) {
    if (previous.slice(-count).every((word, i) => word === next[i])) return count;
  }
  return 0;
}

/** `next` without its first words that repeat the end of `previous`. */
function stripRepeatedPrefix(previous: string, next: string): string {
  const nextWords = next.split(/\s+/).filter(Boolean);
  const skip = repeatedPrefix(previous.split(/\s+/).filter(Boolean).map(normalizeWord), nextWords.map(normalizeWord));
  return nextWords.slice(skip).join(' ');
}

/** A word both chunks heard inside their overlap at nearly the same time, nearest the overlap's middle: the earlier chunk keeps
 *  it and the words before it, the later supplies what follows. How many open words to keep and incoming words to skip. */
function seamAnchor(previous: Word[], incoming: Word[], overlapStartMs: number, overlapMs: number): { kept: number; skipped: number } | null {
  const middle = overlapStartMs + overlapMs / 2;
  const inOverlap = (word: Word) => word.startMs >= overlapStartMs && word.startMs < overlapStartMs + overlapMs;
  let best: { distance: number; kept: number; skipped: number } | null = null;
  previous.forEach((old, kept) => {
    const text = normalizeWord(old.text);
    if (!inOverlap(old) || !text) return;
    incoming.forEach((word, skipped) => {
      if (!inOverlap(word) || Math.abs(old.startMs - word.startMs) > anchorMs || normalizeWord(word.text) !== text) return;
      const distance = Math.abs(old.startMs - middle);
      if (!best || distance < best.distance) best = { distance, kept: kept + 1, skipped: skipped + 1 };
    });
  });
  return best;
}

/** Word ranges of each sentence: a sentence ends after . ? ! or before a pause. */
function sentenceGroups(words: Word[]): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  words.forEach((word, index) => {
    const group = groups.at(-1);
    const heardUntil = group ? Math.max(...words.slice(group.start, group.end).map((w) => w.endMs)) : 0;
    if (group && !SENTENCE_END.test(words[group.end - 1].text) && word.startMs - heardUntil < sentencePauseMs) group.end = index + 1;
    else groups.push({ start: index, end: index + 1 });
  });
  return groups;
}

/** Moves sentences no later chunk can change into the lines: every one when nothing overlaps the next chunk, else those wholly
 *  before `seamMs` and closed by punctuation or a later sentence. */
function publishSentences(track: TrackTranscript, seamMs: number, all: boolean): void {
  const groups = sentenceGroups(track.words);
  const beforeSeam = (word: Word) => word.startMs < seamMs;
  const closed = (index: number) => {
    const { start, end } = groups[index];
    const next = groups[index + 1];
    return track.words.slice(start, end).every(beforeSeam) && (SENTENCE_END.test(track.words[end - 1].text) || (!!next && beforeSeam(track.words[next.start])));
  };
  let published = all ? groups.length : 0;
  while (!all && published < groups.length && closed(published)) published++;
  const words = track.words.splice(0, groups[published]?.start ?? track.words.length);
  for (const { start, end } of groups.slice(0, published)) {
    const sentence = words.slice(start, end);
    track.entries.push({
      source: track.source,
      startMs: sentence[0].startMs,
      endMs: Math.max(...sentence.map((w) => w.endMs)),
      text: sentence.map((w) => w.text).join(' '),
      timed: true,
    });
  }
}

/** Joins a chunk's timed words at the seam word by word, so a sentence across a hard cut keeps every word from one side or the other. */
function acceptWords(track: TrackTranscript, chunk: ChunkSpan, words: TranscriptSegment[]): void {
  const duration = chunk.endMs - chunk.startMs;
  let incoming = words.flatMap((w): Word[] => {
    const text = w.text.trim();
    const start = Math.min(Math.max(0, w.startSecond * 1_000), duration);
    const end = Math.min(Math.max(start, w.endSecond * 1_000), duration);
    return text ? [{ text, startMs: chunk.startMs + start, endMs: chunk.startMs + end }] : [];
  });
  if (chunk.overlapMs > 0) {
    const anchor = seamAnchor(track.words, incoming, chunk.startMs, chunk.overlapMs);
    if (anchor) {
      track.words = track.words.slice(0, anchor.kept);
      incoming = incoming.slice(anchor.skipped);
    } else {
      const seam = chunk.startMs + chunk.overlapMs / 2;
      track.words = track.words.filter((w) => w.startMs < seam);
      incoming = incoming.filter((w) => w.startMs >= seam);
      const previous = track.words.length > 0 ? track.words.map((w) => w.text) : (track.entries.at(-1)?.text.split(/\s+/) ?? []);
      incoming = incoming.slice(repeatedPrefix(previous.map(normalizeWord), incoming.map((w) => normalizeWord(w.text))));
    }
  }
  track.words.push(...incoming);
}

/** A model without word times: its timed segments (or its text over the chunk) as lines, the overlap's re-heard words dropped. */
function acceptSegments(track: TrackTranscript, chunk: ChunkSpan, result: TranscriptResult): void {
  const duration = chunk.endMs - chunk.startMs;
  const at = (second: number) => Math.min(Math.max(0, second * 1_000), duration);
  const segmented = result.segments.length > 0 && result.segments.every((s) => !s.text.trim() || at(s.endSecond) > at(s.startSecond));
  const text = (segmented || result.text.trim() ? result.text : result.segments.map((s) => s.text.trim()).filter(Boolean).join(' ')).trim();
  const line = (startMs: number, endMs: number, words: string, timed: boolean): LiveEntry => ({ source: track.source, startMs, endMs, text: words, timed });
  let incoming = segmented
    ? result.segments.flatMap((s) => (s.text.trim() && at(s.endSecond) > at(s.startSecond) ? [line(chunk.startMs + at(s.startSecond), chunk.startMs + at(s.endSecond), s.text.trim(), true)] : []))
    : text ? [line(chunk.startMs, chunk.endMs, text, false)] : [];
  if (chunk.overlapMs > 0) {
    if (segmented) {
      const seam = chunk.startMs + chunk.overlapMs / 2;
      track.entries = track.entries.filter((e) => e.startMs < seam);
      incoming = incoming.filter((e) => e.startMs >= seam);
    }
    const previous = track.entries.at(-1);
    if (previous && incoming[0]) incoming[0] = { ...incoming[0], text: stripRepeatedPrefix(previous.text, incoming[0].text) };
    incoming = incoming.filter((e) => e.text);
  }
  track.entries.push(...incoming);
}

/** Publishes every open word, as when no chunk follows. */
export function finishTrack(track: TrackTranscript): void {
  if (track.words.length > 0) track.settledMs = Math.max(track.settledMs, Math.max(...track.words.map((w) => w.endMs)) + 1);
  publishSentences(track, track.settledMs, true);
}

/** Takes a transcribed chunk: its words when the model gives them (or, with words still open, an empty chunk), else its segments. */
export function acceptChunk(track: TrackTranscript, chunk: ChunkSpan, result: TranscriptResult): void {
  const nextSeam = chunk.endMs - chunk.tailMs / 2;
  track.settledMs = Math.max(track.settledMs, nextSeam);
  const heard = result.segments.length > 0 || result.text.trim() !== '';
  const words = result.words ?? [];
  if (words.length > 0 || (!heard && track.words.length > 0)) {
    acceptWords(track, chunk, words);
    publishSentences(track, nextSeam, chunk.tailMs === 0);
    return;
  }
  // a model without word times took over mid-track
  finishTrack(track);
  acceptSegments(track, chunk, result);
}
