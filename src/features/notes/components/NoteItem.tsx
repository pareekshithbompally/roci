/**
 * NoteItem Component
 *
 * Displays a single note with edit and delete functionality.
 * Uses the notes context for actions.
 */

import React, { useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import type { Note } from '@features/notes/types/notes.types';
import { IconButton, Surface, Text, Textarea } from '@shared/ui';

interface NoteItemProps {
  note: Note;
  onDelete: (noteId: string) => void;
  onUpdate?: (noteId: string, text: string) => void;
}

const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const NoteItem: React.FC<NoteItemProps> = ({ note, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);

  const handleSave = () => {
    if (editText.trim() && onUpdate) {
      onUpdate(note.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(note.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <Surface variant="card" radius="xl" className="p-4 group">
      <div className="flex justify-between items-start gap-3 mb-2">
        <Text variant="helper" tone="muted">{formatDateTime(note.timestamp)}</Text>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && onUpdate && (
            <IconButton icon={Edit2} label="Edit note" size="sm" onClick={() => setIsEditing(true)} />
          )}
          <IconButton icon={Trash2} label="Delete note" size="sm" variant="dangerGhost" onClick={() => onDelete(note.id)} />
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className="w-full h-24"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <IconButton icon={X} label="Cancel" size="sm" onClick={handleCancel} />
            <IconButton icon={Check} label="Save" size="sm" onClick={handleSave} />
          </div>
          <Text as="p" variant="caption" tone="faint">Press ⌘+Enter to save, Esc to cancel</Text>
        </div>
      ) : (
        <Text as="p" variant="reading" tone="muted" className="leading-relaxed whitespace-pre-wrap break-words">
          {note.text}
        </Text>
      )}
    </Surface>
  );
};

export default NoteItem;
