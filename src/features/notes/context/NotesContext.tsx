/**
 * Notes Context
 * 
 * Provides notes state and actions to all child components.
 * Manages notes for a specific meeting.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { notesRepository } from '../../../../services/repositories';
import type { NoteEntry } from '@/types';
import type { NotesContextValue, NotesState, Note } from '../types';

const initialState: NotesState = {
  notes: [],
  isLoading: false,
  error: null,
  isCreating: false,
};

const NotesContext = createContext<NotesContextValue | null>(null);

export const useNotesContext = (): NotesContextValue => {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotesContext must be used within a NotesProvider');
  }
  return context;
};

interface NotesProviderProps {
  children: React.ReactNode;
  meetingId?: string | null;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({ children, meetingId = null }) => {
  const [state, setState] = useState<NotesState>(initialState);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(meetingId);

  // Load notes for a meeting
  const loadNotes = useCallback(async (id: string) => {
    console.log('[NotesContext] Loading notes for meeting:', id);
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setCurrentMeetingId(id);

    try {
      const entries = await notesRepository.readDoc(id);
      if (entries && entries.length > 0) {
        const notes: Note[] = entries.map((n: NoteEntry) => ({
          id: n.id,
          text: n.text,
          timestamp: new Date(n.createdAt).getTime(),
          meetingId: id,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          version: 1,
        }));
        console.log('[NotesContext] ✓ Loaded', notes.length, 'notes');
        setState(prev => ({ ...prev, notes, isLoading: false }));
      } else {
        console.log('[NotesContext] No notes found for meeting:', id);
        setState(prev => ({ ...prev, notes: [], isLoading: false }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load notes';
      console.error('[NotesContext] ✗ Failed to load notes:', error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
    }
  }, []);

  // Auto-load notes when meetingId changes
  useEffect(() => {
    if (meetingId) {
      console.log('[NotesContext] MeetingId changed, loading notes:', meetingId);
      loadNotes(meetingId);
    } else {
      console.log('[NotesContext] No meetingId, clearing notes');
      setState(initialState);
      setCurrentMeetingId(null);
    }
  }, [meetingId, loadNotes]);

  // Add a new note
  const addNote = useCallback(async (text: string) => {
    if (!currentMeetingId) {
      console.warn('[NotesContext] Cannot add note: no meeting ID');
      return;
    }

    console.log('[NotesContext] Adding note to meeting:', currentMeetingId);

    // Create optimistic note immediately
    const noteId = crypto.randomUUID();
    const optimisticNote: Note = {
      id: noteId,
      text,
      timestamp: Date.now(),
      meetingId: currentMeetingId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // Optimistically update UI immediately
    setState(prev => ({
      ...prev,
      notes: [optimisticNote, ...prev.notes],
      isCreating: false,
    }));

    try {
      const now = new Date().toISOString();
      const noteEntry: NoteEntry = {
        id: noteId,
        text,
        createdAt: now,
        updatedAt: now,
      };
      const ok = await notesRepository.addNote(currentMeetingId, noteEntry);
      if (ok) {
        console.log('[NotesContext] ✓ Note saved to disk:', noteEntry.id);
        const realNote: Note = {
          id: noteEntry.id,
          text: noteEntry.text,
          timestamp: Date.now(),
          meetingId: currentMeetingId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        setState(prev => ({
          ...prev,
          notes: prev.notes.map(n => n.id === optimisticNote.id ? realNote : n),
        }));
      } else {
        console.error('[NotesContext] ✗ Failed to save note, rolling back');
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => n.id !== optimisticNote.id),
          error: 'Failed to save note',
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add note';
      console.error('[NotesContext] ✗ Exception adding note, rolling back:', error);
      // Roll back optimistic update
      setState(prev => ({
        ...prev,
        notes: prev.notes.filter(n => n.id !== optimisticNote.id),
        error: errorMessage,
      }));
    }
  }, [currentMeetingId]);

  // Update a note
  const updateNote = useCallback(async (noteId: string, text: string) => {
    if (!currentMeetingId) return;

    try {
      const ok = await notesRepository.updateNote(currentMeetingId, noteId, text);
      if (ok) {
        setState(prev => ({
          ...prev,
          notes: prev.notes.map(n => n.id === noteId ? { ...n, text, updatedAt: new Date().toISOString() } : n),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update note';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Delete a note
  const deleteNote = useCallback(async (noteId: string) => {
    if (!currentMeetingId) return;

    try {
      const ok = await notesRepository.deleteNote(currentMeetingId, noteId);
      if (ok) {
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => n.id !== noteId),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete note';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Clear notes
  const clearNotes = useCallback(() => {
    setState(initialState);
    setCurrentMeetingId(null);
  }, []);

  // Set creating state
  const setCreating = useCallback((isCreating: boolean) => {
    setState(prev => ({ ...prev, isCreating }));
  }, []);

  // Computed values
  const notesCount = state.notes.length;

  const value: NotesContextValue = {
    ...state,
    meetingId: currentMeetingId,
    notesCount,
    loadNotes,
    addNote,
    updateNote,
    deleteNote,
    clearNotes,
    setCreating,
  };

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
};

export default NotesContext;
