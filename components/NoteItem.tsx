import React, { useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import { Note } from '../types';

interface NoteItemProps {
  note: Note;
  onDelete: (noteId: string) => void;
  onUpdate?: (noteId: string, text: string) => void;
}

/**
 * NoteItem Component
 * 
 * Displays a single note with:
 * - Note text content
 * - Date and time
 * - Edit functionality
 * - Delete button
 */
const NoteItem: React.FC<NoteItemProps> = ({ note, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);

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
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60 group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex justify-between items-start gap-3 mb-2">
        <time className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDateTime(note.timestamp)}
        </time>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && onUpdate && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500 dark:text-zinc-400"
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
            className="w-full h-24 p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white resize-none outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
        </div>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          {note.text}
        </p>
      )}
    </div>
  );
};

export default NoteItem;
