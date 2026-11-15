/** Notes feature: meeting-linked notes with add, edit, and delete. */

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
