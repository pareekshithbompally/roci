/**
 * useMeetingNotes Hook
 *
 * TanStack Query-based notes hook for a single meeting.
 * Reads/writes via the unified store (Phase 3).
 * Provides optimistic mutations with rollback on failure.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { store } from '@services/db';
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
    queryKey: queryKeys.storeNotes(meetingId!),
    queryFn: async () => {
      const entries = await store.notes.list(meetingId!);
      if (entries.length === 0) return [];
      return entries.map((n) => mapEntryToNote(n, meetingId!));
    },
    enabled: !!meetingId,
  });

  const queryError = error ? (error instanceof Error ? error.message : 'Failed to load notes') : null;

  const addNoteMutate = useMutation({
    mutationFn: async (text: string) => {
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), meetingId: meetingId!, text, createdAt: now };
      await store.notes.upsert(entry);
      return entry;
    },
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.storeNotes(meetingId!));
      const optimistic: Note = {
        id: crypto.randomUUID(),
        text,
        timestamp: Date.now(),
        meetingId: meetingId!,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      queryClient.setQueryData<Note[]>(queryKeys.storeNotes(meetingId!), (old) =>
        [optimistic, ...(old || [])]
      );
      return { previous };
    },
    onError: (_err, _text, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeNotes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
    },
  });

  const updateNoteMutate = useMutation({
    mutationFn: async ({ noteId, text }: { noteId: string; text: string }) => {
      await store.notes.upsert({ id: noteId, meetingId: meetingId!, text });
    },
    onMutate: async ({ noteId, text }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.storeNotes(meetingId!));
      queryClient.setQueryData<Note[]>(queryKeys.storeNotes(meetingId!), (old) =>
        (old || []).map((n) =>
          n.id === noteId ? { ...n, text, updatedAt: new Date().toISOString() } : n
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeNotes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
    },
  });

  const deleteNoteMutate = useMutation({
    mutationFn: async (noteId: string) => {
      await store.notes.delete(noteId);
    },
    onMutate: async (noteId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.storeNotes(meetingId!));
      queryClient.setQueryData<Note[]>(queryKeys.storeNotes(meetingId!), (old) =>
        (old || []).filter((n) => n.id !== noteId)
      );
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeNotes(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
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
