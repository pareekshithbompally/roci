/** One meeting's notes via TanStack Query, with optimistic mutations and rollback. */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import type { NoteEntry } from '@shared/types';
import type { Note } from '@features/notes/types';

interface NoteDraft {
  id: string;
  text: string;
  createdAt: string;
}

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
    mutationFn: async (draft: NoteDraft) => {
      await store.notes.upsert({ ...draft, meetingId: meetingId! });
    },
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeNotes(meetingId!) });
      const previous = queryClient.getQueryData<Note[]>(queryKeys.storeNotes(meetingId!));
      const optimistic: Note = {
        id: draft.id,
        text: draft.text,
        timestamp: new Date(draft.createdAt).getTime(),
        meetingId: meetingId!,
        createdAt: draft.createdAt,
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      queryClient.setQueryData<Note[]>(queryKeys.storeNotes(meetingId!), (old) =>
        [optimistic, ...(old || [])]
      );
      return { previous };
    },
    onError: (_err, _draft, context) => {
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
      await store.notes.delete(noteId, meetingId!);
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

  /** A new note; a caller that tracks the note itself passes its id and when it was written. */
  const addNote = useCallback(
    async (text: string, options: { id?: string; createdAt?: string } = {}) => {
      if (!meetingId) return;
      await addNoteMutate.mutateAsync({ id: options.id ?? crypto.randomUUID(), text, createdAt: options.createdAt ?? new Date().toISOString() });
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

  return {
    notes,
    isLoading,
    error: queryError,
    meetingId,
    addNote,
    updateNote,
    deleteNote,
  };
}
