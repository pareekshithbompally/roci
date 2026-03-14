/**
 * NoteItem Component
 *
 * Displays a single note with edit and delete functionality.
 * Uses the notes context for actions.
 */

import React, { useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { Note } from '../types/notes.types';

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
    <div className={`p-4 rounded-xl ${SURFACE.card} border ${BORDER.subtle} group ${BORDER.cardHover} transition-colors`}>
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="flex items-center gap-2">
          <time className={`text-xs ${TEXT.muted}`}>
            {formatDateTime(note.timestamp)}
          </time>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && onUpdate && (
            <button
              onClick={() => setIsEditing(true)}
              className={`p-1 ${SURFACE.hoverSubtle} rounded ${TEXT.muted}`}
              aria-label="Edit note"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(note.id)}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 dark:text-red-400"
            aria-label="Delete note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`w-full h-24 p-2 ${COMPONENT.inlineInput} resize-none`}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className={`p-1.5 rounded-lg ${TEXT.muted} ${SURFACE.hoverSubtle}`}
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
          <p className={`text-xs ${TEXT.faint}`}>Press ⌘+Enter to save, Esc to cancel</p>
        </div>
      ) : (
        <p className={`text-sm ${TEXT.secondary} leading-relaxed whitespace-pre-wrap break-words`}>
          {note.text}
        </p>
      )}
    </div>
  );
};

export default NoteItem;
