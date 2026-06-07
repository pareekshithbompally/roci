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
 * import { useNotes, NotesView } from '@/features/notes';
 * 
 * <NotesView />
 * ```
 */

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
} from './types';
