/** The record screen's notes: the typed lines and the enhanced bullets (UI state), and the refresh that keeps the bullets up
 *  to date — one request at a time, a newer one cancelling the stale one. */

import { useMemo } from 'react';
import { create } from 'zustand';
import { refreshLiveNotes } from '@services/ai/liveNotes';
import { errorMessage } from '@shared/utils/errors';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { LiveEntry } from '@features/recording/live/liveTranscript';
import { formatClock } from '@shared/utils/formatters';
import { indexStretch, searchMeetingWithin } from '@extensions/rag';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import {
  changedNotes, changesFromReply, enhancedBullets, entryKey, liveNotesRequest, mergeBullets, notesSeen, NO_RECALL, recallOf, reconcileLines,
  refreshReason, signatureOf, transcriptText, unsentEntries,
  type Bullet, type NoteLine, type Recall, type Span, type TypedAt,
} from './liveNotes';

interface LiveNotesState {
  meetingId: string | null;
  lines: NoteLine[];
  bullets: Bullet[];
  /** A refresh is in flight. */
  updating: boolean;
  /** Why the last refresh failed, in words to show; cleared by the next one that works. */
  problem: string | null;
}

export const useLiveNotesStore = create<LiveNotesState>(() => ({ meetingId: null, lines: [], bullets: [], updating: false, problem: null }));

/** What the refreshes have covered (not shown, so kept out of the store). */
interface Session {
  /** Entries a refresh applied. */
  sent: Set<string>;
  /** Entries handed to any refresh, applied or not, so a failed one isn't retried on every new entry. */
  taken: Set<string>;
  /** The notes as the last applied refresh saw them. */
  signature: string;
  /** The end of the newest transcript any update was handed (ms on the recording clock); the cadence counts from here. */
  coveredUntilMs: number;
  /** Each note's text as the last applied update saw it. */
  seen: Map<string, string>;
  /** This recording's indexed stretches (chunk text → when it was said), for recalling earlier talk. */
  spans: Map<string, Span>;
  controller: AbortController | null;
}

const freshSession = (): Session => ({
  sent: new Set(), taken: new Set(), signature: '', coveredUntilMs: 0, seen: new Map(), spans: new Map(), controller: null,
});
let session = freshSession();

const get = useLiveNotesStore.getState;
const set = useLiveNotesStore.setState;
const clock = (ms: number) => formatClock(Math.floor(ms / 1_000));

/** Where new points sit on the clock: where the talk they came from began (the newest entry's end when only notes changed). */
const talkStartMs = (payload: LiveEntry[], entries: LiveEntry[]): number =>
  payload.length > 0 ? Math.min(...payload.map((e) => e.startMs)) : Math.max(0, ...entries.map((e) => e.endMs));

/** An update overtaken since it began: stopped, superseded by a newer one, or its recording replaced by another meeting's. */
const stale = (current: Session, controller: AbortController): boolean =>
  controller.signal.aborted || current.controller !== controller || session !== current;

/** Earlier talk for the changed notes and the new transcript, from the meeting's own index in one search; nothing before any
 *  stretch is indexed. */
async function recallFor(current: Session, meetingId: string, lines: NoteLine[], transcript: string): Promise<Recall> {
  const notes = changedNotes(lines, current.seen);
  const queries = transcript ? [...notes, transcript] : notes;
  if (queries.length === 0 || current.spans.size === 0) return NO_RECALL;
  const hits = await searchMeetingWithin(meetingId, queries, NOTES.recall.passagesPerQuery);
  const texts = hits.map((found) => found.map((hit) => hit.chunkText));
  return recallOf(texts.slice(0, notes.length), texts.flat(), current.spans);
}

/** Indexes the stretch an applied update covered — after it, never before one — so later updates can recall it. */
function remember(current: Session, meetingId: string, transcript: string, span: Span): void {
  if (!transcript) return;
  indexStretch(meetingId, transcript)
    .then((texts) => texts.forEach((text) => current.spans.set(text, span)))
    .catch((error: unknown) => console.error('[liveNotes] Indexing the stretch failed:', error));
}

export const liveNotes = {
  /** A new recording's notes; the same meeting again keeps what is there. */
  start(meetingId: string): void {
    if (get().meetingId === meetingId) return;
    session.controller?.abort();
    session = freshSession();
    set({ meetingId, lines: [], bullets: [], updating: false, problem: null });
  },

  /** The recording ended: an update in flight is dropped (the summary writes the notes from here), so nothing of it lands
   *  after the meeting's final index. */
  stop(): void {
    session.controller?.abort();
  },

  /** The meeting's saved lines, taken only when nothing is held yet (opening a meeting, or a reload mid-recording). */
  seed(lines: NoteLine[]): void {
    if (get().lines.length === 0) set({ lines });
  },

  type(text: string, now: TypedAt): void {
    set({ lines: reconcileLines(get().lines, text, now) });
  },

  /** Whether a refresh should run now. */
  due(entries: LiveEntry[], typingPaused: boolean): boolean {
    const notesChanged = signatureOf(get().lines) !== session.signature;
    const untaken = entries.filter((e) => !session.taken.has(entryKey(e)));
    return refreshReason({ unsent: untaken, coveredUntilMs: session.coveredUntilMs, notesChanged, typingPaused }) !== null;
  },

  /** Sends the notes, bullets and every transcript entry not yet applied; applies the changed bullets unless a newer refresh started. */
  async refresh(entries: LiveEntry[], resolved: ResolvedModel, participants: string[] = []): Promise<void> {
    const { meetingId, lines, bullets } = get();
    if (!meetingId) return;
    session.controller?.abort();
    const controller = new AbortController();
    const current = session;
    current.controller = controller;
    const payload = unsentEntries(entries, current.sent);
    payload.forEach((e) => current.taken.add(entryKey(e)));
    current.coveredUntilMs = Math.max(current.coveredUntilMs, ...payload.map((e) => e.endMs));
    const signature = signatureOf(lines);
    const transcript = transcriptText(payload, clock);
    set({ updating: true });
    try {
      const recall = await recallFor(current, meetingId, lines, transcript);
      if (stale(current, controller)) return;
      const { input, realId } = liveNotesRequest(lines, bullets, transcript, { recall, participants }, clock);
      const reply = await refreshLiveNotes({ input, resolved, meetingId, signal: controller.signal });
      if (stale(current, controller)) return;
      const changes = changesFromReply(reply, realId);
      payload.forEach((e) => current.sent.add(entryKey(e)));
      current.signature = signature;
      current.seen = notesSeen(lines);
      remember(current, meetingId, transcript, { startMs: talkStartMs(payload, entries), endMs: current.coveredUntilMs });
      set({ bullets: mergeBullets(get().bullets, changes, get().lines, talkStartMs(payload, entries)), problem: null });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      console.error('[liveNotes] Refresh failed:', error);
      set({ problem: errorMessage(error) });
    } finally {
      if (current.controller === controller) {
        current.controller = null;
        set({ updating: false });
      }
    }
  },
};

const NO_BULLETS: Bullet[] = [];

/** A meeting's AI lines: the summary's enhanced notes once written, before that the live ones of the meeting just recorded. */
export function useAiBullets(meetingId: string, enhanced: string[] | undefined): Bullet[] {
  const owner = useLiveNotesStore((s) => s.meetingId);
  const lines = useLiveNotesStore((s) => s.lines);
  const bullets = useLiveNotesStore((s) => s.bullets);
  return useMemo(() => {
    if (owner !== meetingId) return NO_BULLETS;
    return enhanced && enhanced.length > 0 ? enhancedBullets(lines, enhanced) : bullets;
  }, [meetingId, owner, lines, bullets, enhanced]);
}
