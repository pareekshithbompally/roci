/** A meeting's notes pane: the user's lines and the AI lines that fill them in, live while recording and after. */

export { useLiveNotes } from './useLiveNotes';
export { AiNotes, EmptyLine, NotesPane, PaneHeader, YourNotes } from './LiveNotesPanes';
export type { NotesPaneProps } from './LiveNotesPanes';
export { useAiBullets, useLiveNotesStore } from './liveNotesStore';
