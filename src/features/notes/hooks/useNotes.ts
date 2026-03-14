/**
 * useNotes Hook
 * 
 * Main hook for accessing notes functionality.
 * Wraps the NotesContext for convenient usage.
 */

import { useNotesContext } from '../context';

export const useNotes = () => {
  const context = useNotesContext();
  
  return {
    // State
    notes: context.notes,
    isLoading: context.isLoading,
    error: context.error,
    isCreating: context.isCreating,
    meetingId: context.meetingId,
    
    // Computed
    notesCount: context.notesCount,
    pinnedNotes: context.pinnedNotes,
    hasNotes: context.notes.length > 0,
    
    // Actions
    loadNotes: context.loadNotes,
    addNote: context.addNote,
    updateNote: context.updateNote,
    deleteNote: context.deleteNote,
    togglePin: context.togglePin,
    clearNotes: context.clearNotes,
    setCreating: context.setCreating,
  };
};

export default useNotes;
