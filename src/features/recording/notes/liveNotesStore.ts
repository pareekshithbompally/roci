/** The record screen's notes: the typed lines and the enhanced bullets (UI state), and the refresh that keeps the bullets up
 *  to date — one request at a time, a newer one cancelling the stale one. */

import { useMemo } from 'react';
import { create } from 'zustand';
import { refreshLiveNotes } from '@services/ai/liveNotes';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { LiveEntry } from '@features/recording/live/liveTranscript';
import { formatClock } from '@features/recording/stores/recordingStore';
import {
  changesFromReply, entryKey, liveNotesRequest, mergeBullets, reconcileLines, refreshReason, signatureOf, transcriptText, unsentEntries,
  type Bullet, type NoteLine, type TypedAt,
} from './liveNotes';

interface LiveNotesState {
  meetingId: string | null;
  lines: NoteLine[];
  bullets: Bullet[];
  /** A refresh is in flight. */
  updating: boolean;
}

export const useLiveNotesStore = create<LiveNotesState>(() => ({ meetingId: null, lines: [], bullets: [], updating: false }));

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
  controller: AbortController | null;
}

const freshSession = (): Session => ({ sent: new Set(), taken: new Set(), signature: '', coveredUntilMs: 0, controller: null });
let session = freshSession();

const get = useLiveNotesStore.getState;
const set = useLiveNotesStore.setState;
const clock = (ms: number) => formatClock(Math.floor(ms / 1_000));

/** Where new points sit on the clock: where the talk they came from began (the newest entry's end when only notes changed). */
const talkStartMs = (payload: LiveEntry[], entries: LiveEntry[]): number =>
  payload.length > 0 ? Math.min(...payload.map((e) => e.startMs)) : Math.max(0, ...entries.map((e) => e.endMs));

export const liveNotes = {
  /** A new recording's notes; the same meeting again keeps what is there. */
  start(meetingId: string): void {
    if (get().meetingId === meetingId) return;
    session.controller?.abort();
    session = freshSession();
    set({ meetingId, lines: [], bullets: [], updating: false });
  },

  /** Lines saved before this screen opened (a reload mid-recording), taken only when nothing is typed yet; says whether it took them. */
  seed(lines: NoteLine[]): boolean {
    if (get().lines.length > 0) return false;
    set({ lines });
    return true;
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
  async refresh(entries: LiveEntry[], resolved: ResolvedModel): Promise<void> {
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
    set({ updating: true });
    try {
      const { input, realId } = liveNotesRequest(lines, bullets, transcriptText(payload, clock), clock);
      const reply = await refreshLiveNotes({ input, resolved, meetingId, signal: controller.signal });
      if (current.controller !== controller) return;
      const changes = changesFromReply(reply, realId);
      payload.forEach((e) => current.sent.add(entryKey(e)));
      current.signature = signature;
      set({ bullets: mergeBullets(get().bullets, changes, get().lines, talkStartMs(payload, entries)) });
    } catch (error: unknown) {
      if (!controller.signal.aborted) console.error('[liveNotes] Refresh failed:', error);
    } finally {
      if (current.controller === controller) {
        current.controller = null;
        set({ updating: false });
      }
    }
  },
};

/** The live AI notes of a meeting just recorded, shown on its Overview until the summary's own land; empty for any other. */
export function useInterimAiNotes(meetingId: string | null): string[] {
  const owner = useLiveNotesStore((s) => s.meetingId);
  const bullets = useLiveNotesStore((s) => s.bullets);
  return useMemo(() => (meetingId && owner === meetingId ? bullets.map((b) => b.text) : []), [meetingId, owner, bullets]);
}
