import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import NoteItem from './NoteItem';
import { Note } from '../types';
import { AlertCircle } from 'lucide-react';

interface NotesViewProps {
  notes: Note[];
  onAddNote: (text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, text: string) => void;
}

/**
 * NotesView Component
 * 
 * Displays user notes with:
 * - Create new note functionality
 * - List of existing notes
 * - Date/time for each note
 * - Delete functionality
 */
const NotesView: React.FC<NotesViewProps> = ({ 
  notes, 
  onAddNote, 
  onDeleteNote,
  onUpdateNote
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [noteText, setNoteText] = useState("");

  const handleSaveNote = () => {
    if (noteText.trim()) {
      onAddNote(noteText.trim());
      setNoteText("");
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setNoteText("");
    setIsCreating(false);
  };

  return (
    <div className="max-w-4xl space-y-4">
      {/* Add button - only show when not creating */}
      {!isCreating && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Add Note
          </button>
        </div>
      )}

      {/* New note input */}
      {isCreating && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 animate-fade-in">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write your note here..."
            className="w-full h-32 p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[15px] text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 resize-none"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={!noteText.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="p-12 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
          <AlertCircle className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No notes yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onDelete={onDeleteNote}
              onUpdate={onUpdateNote}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NotesView;
