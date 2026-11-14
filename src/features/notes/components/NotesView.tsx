/**
 * NotesView Component
 *
 * Main notes view with list and create functionality.
 * Uses the notes context for state and actions.
 */

import React from 'react';
import { Plus, Loader2, StickyNote } from 'lucide-react';
import { useNotes } from '@features/notes/hooks';
import { EmptyState } from '@shared/components';
import NoteItem from './NoteItem';
import NoteEditor from './NoteEditor';
import { Button, Callout, Icon, Text } from '@shared/ui';

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
        <Icon icon={Loader2} size="lg" tone="faint" className="animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <Callout variant="error">{error}</Callout>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-full gap-y-5 ${className}`}>
      {/* Top action bar - always visible */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex-1">
          {notes.length > 0 && (
            <Text variant="label" tone="muted">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </Text>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)} disabled={isCreating}>
          <Icon icon={Plus} size="xs" />
          Add Note
        </Button>
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
