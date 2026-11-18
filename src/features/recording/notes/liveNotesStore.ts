/** The record screen's notes: the typed lines and the enhanced bullets (UI state), and the refresh that keeps the bullets up
 *  to date — one request at a time, a newer one cancelling the stale one. */

import { useMemo } from 'react';
import { create } from 'zustand';
import { refreshLiveNotes } from '@services/ai/liveNotes';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { LiveEntry } from '@features/recording/live/liveTranscript';
import { formatClock } from '@features/recording/stores/recordingStore';
import {
  entryKey, mergeBullets, reconcileLines, refreshReason, signatureOf, transcriptText, unsentEntries, writtenLines,
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
  controller: AbortController | null;
}

const freshSession = (): Session => ({ sent: new Set(), taken: new Set(), signature: '', controller: null });
let session = freshSession();

const get = useLiveNotesStore.getState;
const set = useLiveNotesStore.setState;
const clock = (ms: number) => formatClock(Math.floor(ms / 1_000));

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
    return refreshReason({ unsent: untaken, notesChanged, typingPaused }) !== null;
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
    const signature = signatureOf(lines);
    set({ updating: true });
    try {
      const changes = await refreshLiveNotes({
        resolved, meetingId, signal: controller.signal,
        notes: writtenLines(lines).map((l) => ({ id: l.id, text: l.text.trim(), at: l.atMs === undefined ? undefined : clock(l.atMs) })),
        bullets,
        transcript: transcriptText(payload, clock),
      });
      if (current.controller !== controller) return;
      payload.forEach((e) => current.sent.add(entryKey(e)));
      current.signature = signature;
      set({ bullets: mergeBullets(get().bullets, changes, get().lines) });
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
