/**
 * Notes Feature Types
 * 
 * Type definitions for the notes feature module
 */

export interface Note {
  id: string;
  text: string;
  timestamp: number;
  meetingId?: string;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface NoteInput {
  text: string;
  meetingId: string;
  pinned?: boolean;
}

export interface NotesState {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
}

export interface NotesActions {
  loadNotes: (meetingId: string) => Promise<void>;
  addNote: (text: string) => Promise<void>;
  updateNote: (noteId: string, text: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  togglePin: (noteId: string) => Promise<void>;
  clearNotes: () => void;
  setCreating: (isCreating: boolean) => void;
}

export interface NotesContextValue extends NotesState, NotesActions {
  meetingId: string | null;
  notesCount: number;
  pinnedNotes: Note[];
}
