/** A meeting's notes pane, wired: typing records each line's time and a typing pause saves the lines to the meeting's notes;
 *  the summary fills them in after the meeting. No timer runs except the one armed by typing (I10). */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { summaryModel } from '@services/ai/jobModel';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { useMeetingNotes } from '@features/notes';
import { recordedSeconds, useRecordingStore } from '@features/recording/stores/recordingStore';
import { writtenLines, type NoteLine } from './liveNotes';
import { liveNotes, useLiveNotesStore } from './liveNotesStore';

const report = (step: string) => (error: unknown) => console.error(`[useLiveNotes] ${step} failed:`, error);

/** The Summary model when it can be called, or the setup problem in the way (the same check the summary makes). */
function useSummaryModel(): { model: ResolvedModel | null; problem: string | null } {
  const { settings, providers } = useSettings();
  return useMemo(() => {
    const check = summaryModel(settings, providers);
    return { model: check.model ?? null, problem: check.problem?.message ?? null };
  }, [settings, providers]);
}

/** Saves the typed lines as the meeting's notes: new lines added under their own ids, edited ones updated, emptied ones deleted. */
function useSaveLines(meetingId: string) {
  const { notes, isLoading, addNote, updateNote, deleteNote } = useMeetingNotes(meetingId);
  // id → text as last saved, for the lines this screen owns
  const saved = useRef(new Map<string, string>());
  const seeded = useRef(false);

  useEffect(() => {
    if (isLoading || seeded.current) return;
    seeded.current = true;
    const lines: NoteLine[] = [...notes].sort((a, b) => a.timestamp - b.timestamp).map((n) => ({ id: n.id, text: n.text }));
    // what is on disk is what is saved, whether its lines are taken now or the screen already holds them (the meeting just recorded)
    lines.forEach((l) => saved.current.set(l.id, l.text));
    liveNotes.seed(lines);
  }, [isLoading, notes]);

  return useCallback(async (): Promise<void> => {
    const written = writtenLines(useLiveNotesStore.getState().lines);
    const ids = new Set(written.map((l) => l.id));
    const writes = written.filter((l) => saved.current.get(l.id) !== l.text.trim()).map((l) => {
      const text = l.text.trim();
      const known = saved.current.has(l.id);
      saved.current.set(l.id, text);
      return known ? updateNote(l.id, text) : addNote(text, { id: l.id, createdAt: new Date(l.typedAt ?? Date.now()).toISOString() });
    });
    const deletes = [...saved.current.keys()].filter((id) => !ids.has(id)).map((id) => {
      saved.current.delete(id);
      return deleteNote(id);
    });
    await Promise.all([...writes, ...deletes]);
  }, [addNote, updateNote, deleteNote]);
}

/** The meeting's notes, typed and saved; `model` is the Summary model that fills them in after the meeting, `modelProblem` why it
 *  can't. */
export function useLiveNotes(meetingId: string) {
  // first, so a meeting's saved lines are seeded into its own notes, never into the previous meeting's
  useEffect(() => liveNotes.start(meetingId), [meetingId]);
  const { model, problem: modelProblem } = useSummaryModel();
  const save = useSaveLines(meetingId);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSave = useRef(save);
  useEffect(() => {
    latestSave.current = save;
  }, [save]);

  const flush = useCallback((): Promise<void> => {
    clearTimeout(typingTimer.current);
    return latestSave.current();
  }, []);

  // leaving the screen (Stop, or another meeting) saves what was typed
  useEffect(() => () => void flush().catch(report('save')), [flush, meetingId]);

  const type = useCallback((text: string) => {
    liveNotes.type(text, { atMs: recordedSeconds(useRecordingStore.getState()) * 1_000, typedAt: Date.now() });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => void latestSave.current().catch(report('save')), NOTES.typingIdleMs);
  }, []);

  return { type, flush, modelProblem, model };
}
