/** Notes view with the list and an editor for new notes; the tab bar's Add opens the editor. */

import React from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { useNotes } from '@features/notes/hooks';
import { EmptyState } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import NoteItem from './NoteItem';
import NoteEditor from './NoteEditor';
import { Callout, Card, Icon, Text, cn } from '@shared/ui';

interface NotesViewProps {
  /** The new-note editor is open (the meeting's tab bar Add opens it). */
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  className?: string;
}

const NotesView: React.FC<NotesViewProps> = ({ creating, onCreatingChange, className = '' }) => {
  const { notes, isLoading, error, addNote, updateNote, deleteNote } = useNotes();

  const handleSaveNote = async (text: string) => {
    onCreatingChange(false);
    await addNote(text);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!(await confirmDelete('note'))) return;
    await deleteNote(noteId).catch((err: unknown) => console.error('[NotesView] Delete failed:', err));
  };

  const handleCancel = () => {
    onCreatingChange(false);
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
    <div className={cn('flex flex-1 flex-col gap-y-3', className)}>
      {/* Count, once there are notes */}
      {notes.length > 0 && (
        <Text variant="label" tone="muted" className="shrink-0">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </Text>
      )}

      {/* New note editor */}
      {creating && (
        <NoteEditor
          onSave={handleSaveNote}
          onCancel={handleCancel}
          autoFocus
        />
      )}

      {/* Content: empty state or notes list */}
      {notes.length === 0 && !creating ? (
        <EmptyState icon={StickyNote} message="No notes yet" />
      ) : notes.length > 0 ? (
        <Card>
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onDelete={(noteId) => void handleDeleteNote(noteId)}
              onUpdate={updateNote}
            />
          ))}
        </Card>
      ) : null}
    </div>
  );
};

export default NotesView;
