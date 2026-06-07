/**
 * NotesView Component
 * 
 * Main notes view with list and create functionality.
 * Uses the notes context for state and actions.
 */

import React from 'react';
import { Plus, AlertCircle, Loader2, StickyNote } from 'lucide-react';
import { useNotes } from '../hooks';
import { TEXT, COMPONENT } from '@config/theme.config';
import EmptyState from '@shared/components/EmptyState';
import NoteItem from './NoteItem';
import NoteEditor from './NoteEditor';

interface NotesViewProps {
  className?: string;
}

const NotesView: React.FC<NotesViewProps> = ({ className = '' }) => {
  const {
    notes,
    isLoading,
    error,
    isCreating,
    addNote,
    updateNote,
    deleteNote,
    setCreating,
  } = useNotes();

  const handleSaveNote = async (text: string) => {
    await addNote(text);
  };

  const handleCancel = () => {
    setCreating(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className={`w-6 h-6 ${TEXT.faint} animate-spin`} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`p-6 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center ${className}`}>
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-full gap-y-5 ${className}`}>
      {/* Top action bar - always visible */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex-1">
          {notes.length > 0 && (
            <span className={`text-xs font-medium ${TEXT.muted}`}>
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          )}
        </div>
        <button
          onClick={() => setCreating(true)}
          disabled={isCreating}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${COMPONENT.primaryButton} text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Note
        </button>
      </div>

      {/* New note editor */}
      {isCreating && (
        <NoteEditor
          onSave={handleSaveNote}
          onCancel={handleCancel}
          autoFocus
        />
      )}

      {/* Content: empty state or notes list */}
      {notes.length === 0 && !isCreating ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={StickyNote} message="No notes yet" />
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onDelete={deleteNote}
              onUpdate={updateNote}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default NotesView;
