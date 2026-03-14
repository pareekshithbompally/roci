/**
 * Notes Feature Module
 * 
 * Handles all notes-related functionality:
 * - Notes display and management
 * - Add, edit, delete notes
 * - Notes linked to meetings/recordings
 * 
 * Usage:
 * ```tsx
 * import { NotesProvider, useNotes, NotesView } from '@/features/notes';
 * 
 * // Wrap your component with the provider
 * <NotesProvider meetingId={currentMeetingId}>
 *   <NotesView />
 * </NotesProvider>
 * 
 * // Or use the hook directly
 * const { notes, addNote, deleteNote } = useNotes();
 * ```
 */

// Context
export { NotesProvider, useNotesContext } from './context';

// Hooks
export { useNotes } from './hooks';

// Components
export { NotesView, NoteItem, NoteEditor } from './components';

// Types
export type {
  Note,
  NoteInput,
  NotesState,
  NotesActions,
  NotesContextValue,
} from './types';
