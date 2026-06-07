/**
 * useMeetingNotes Hook
 *
 * TanStack Query-based notes hook for a single meeting.
 * Provides optimistic mutations with rollback on failure.
 * Replaces NotesContext state management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { notesRepository } from '@services/repositories';
import { queryKeys } from '@shared/query/queryKeys';
import type { NoteEntry } from '@shared/types';
import type { Note } from '../types';

function mapEntryToNote(entry: NoteEntry, meetingId: string): Note {
  return {
    id: entry.id,
    text: entry.text,
    timestamp: new Date(entry.createdAt).getTime(),
    meetingId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    version: 1,
  };
}

export function useMeetingNotes(meetingId: string | null) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const {
    data: notes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.notes(meetingId!),
    queryFn: async () => {
      const entries = await notesRepository.readDoc(meetingId!);
      if (!entries || entries.length === 0) return [];
      return entries.map((n: NoteEntry) => mapEntryToNote(n, meetingId!));
    },
    enabled: !!meetingId,
  });

  const queryError = error ? (error instanceof Error ? error.message : 'Failed to load notes') : null;

  const addNoteMutate = useMutation({
    mutationFn: async (text: string) => {
      const now = new Date().toISOString();
      const entry: NoteEntry = { id: crypto.randomUUID(), text, createdAt: now, updatedAt: now };
      const ok = await notesRepository.addNote(meetingId!, entry);
      if (!ok) throw new Error('Failed to save note');
      return entry;
    },
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.notes(meetingId!));
      const optimistic: Note = {
        id: crypto.randomUUID(),
        text,
        timestamp: Date.now(),
        meetingId: meetingId!,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      queryClient.setQueryData<Note[]>(queryKeys.notes(meetingId!), (old) =>
        [optimistic, ...(old || [])]
      );
      return { previous };
    },
    onError: (_err, _text, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.notes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(meetingId!) });
    },
  });

  const updateNoteMutate = useMutation({
    mutationFn: async ({ noteId, text }: { noteId: string; text: string }) => {
      const ok = await notesRepository.updateNote(meetingId!, noteId, text);
      if (!ok) throw new Error('Failed to update note');
    },
    onMutate: async ({ noteId, text }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.notes(meetingId!));
      queryClient.setQueryData<Note[]>(queryKeys.notes(meetingId!), (old) =>
        (old || []).map((n) =>
          n.id === noteId ? { ...n, text, updatedAt: new Date().toISOString() } : n
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.notes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(meetingId!) });
    },
  });

  const deleteNoteMutate = useMutation({
    mutationFn: async (noteId: string) => {
      const ok = await notesRepository.deleteNote(meetingId!, noteId);
      if (!ok) throw new Error('Failed to delete note');
    },
    onMutate: async (noteId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.notes(meetingId!));
      queryClient.setQueryData<Note[]>(queryKeys.notes(meetingId!), (old) =>
        (old || []).filter((n) => n.id !== noteId)
      );
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.notes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(meetingId!) });
    },
  });

  const addNote = useCallback(
    async (text: string) => {
      if (!meetingId) return;
      setIsCreating(false);
      await addNoteMutate.mutateAsync(text);
    },
    [meetingId, addNoteMutate]
  );

  const updateNote = useCallback(
    async (noteId: string, text: string) => {
      if (!meetingId) return;
      await updateNoteMutate.mutateAsync({ noteId, text });
    },
    [meetingId, updateNoteMutate]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!meetingId) return;
      await deleteNoteMutate.mutateAsync(noteId);
    },
    [meetingId, deleteNoteMutate]
  );

  const setCreating = useCallback((v: boolean) => setIsCreating(v), []);

  return {
    notes,
    isLoading,
    error: queryError,
    isCreating,
    meetingId,
    notesCount: notes.length,
    hasNotes: notes.length > 0,
    addNote,
    updateNote,
    deleteNote,
    clearNotes: () => {},
    setCreating,
  };
}
