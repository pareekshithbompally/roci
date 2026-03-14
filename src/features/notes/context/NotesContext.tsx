/**
 * Notes Context
 * 
 * Provides notes state and actions to all child components.
 * Manages notes for a specific meeting.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { notesService } from '../../../../services/storage';
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
      const result = await notesService.getNotesForMeeting(id);
      if (result.success && result.data) {
        // Convert StoredNote[] to Note[] format expected by components
        const notes: Note[] = result.data.map(n => ({
          id: n.id,
          text: n.text,
          timestamp: n.timestamp,
          meetingId: n.meetingId,
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
    const optimisticNote: Note = {
      id: `temp-${Date.now()}`,
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
      const result = await notesService.addNote(currentMeetingId, text);
      if (result.success && result.data) {
        console.log('[NotesContext] ✓ Note saved to disk:', result.data.id);
        // Replace optimistic note with real one from server
        const realNote: Note = {
          id: result.data.id,
          text: result.data.text,
          timestamp: result.data.timestamp,
          meetingId: result.data.meetingId,
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
          version: 1,
        };
        
        setState(prev => ({
          ...prev,
          notes: prev.notes.map(n => n.id === optimisticNote.id ? realNote : n),
        }));
      } else {
        console.error('[NotesContext] ✗ Failed to save note, rolling back');
        // Roll back optimistic update
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => n.id !== optimisticNote.id),
          error: result.error,
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
      const result = await notesService.updateNote(currentMeetingId, noteId, text);
      if (result.success && result.data) {
        const updatedNote: Note = {
          id: result.data.id,
          text: result.data.text,
          timestamp: result.data.timestamp,
          meetingId: result.data.meetingId,
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
          version: 1,
        };

        setState(prev => ({
          ...prev,
          notes: prev.notes.map(n => n.id === noteId ? updatedNote : n),
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
      const result = await notesService.deleteNote(currentMeetingId, noteId);
      if (result.success) {
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

  // Toggle pin (placeholder - notesService doesn't have this yet)
  const togglePin = useCallback(async (noteId: string) => {
    // TODO: Implement when pin support is added to storage service
    console.log('Toggle pin for note:', noteId);
  }, []);

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
  const pinnedNotes = useMemo(() => 
    state.notes.filter(n => n.pinned).sort((a, b) => b.timestamp - a.timestamp),
    [state.notes]
  );

  const value: NotesContextValue = {
    ...state,
    meetingId: currentMeetingId,
    notesCount,
    pinnedNotes,
    loadNotes,
    addNote,
    updateNote,
    deleteNote,
    togglePin,
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
