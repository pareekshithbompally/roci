import React, { useState } from 'react';
import { CheckCircle2, Circle, Edit2, Check, X } from 'lucide-react';
import type { ActionItem as ActionItemType } from '@shared/types';

interface ActionItemProps {
  item: ActionItemType;
  onToggle: (itemId: string) => void;
  onUpdate?: (itemId: string, updates: { text?: string; dueDate?: string }) => void;
}

/**
 * ActionItem Component
 *
 * Displays a single action item with:
 * - Checkbox to toggle completion
 * - Strikethrough text when completed
 * - Optional due date display
 * - Edit functionality
 */
const ActionItem: React.FC<ActionItemProps> = ({ item, onToggle, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editDueDate, setEditDueDate] = useState(item.dueDate || '');

  const handleSave = () => {
    if (editText.trim() && onUpdate) {
      onUpdate(item.id, {
        text: editText.trim(),
        dueDate: editDueDate || undefined
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(item.text);
    setEditDueDate(item.dueDate || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="p-3 space-y-2">
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            placeholder="Due date (e.g., Jan 25, 2025)"
            className="flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none"
          />
          <button onClick={handleCancel} className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
          <button onClick={handleSave} className="p-1.5 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20">
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group">
      <button
        onClick={() => onToggle(item.id)}
        className="shrink-0 mt-0.5 transition-colors hover:opacity-80"
      >
        {item.completed ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <Circle className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed transition-all ${
          item.completed
            ? 'line-through text-zinc-400 dark:text-zinc-500'
            : 'text-zinc-700 dark:text-zinc-300'
        }`}>
          {item.text}
        </p>
        {item.dueDate && (
          <span className={`inline-block mt-1 text-xs px-2 py-1 rounded ${
            item.completed
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          }`}>
            Due: {item.dueDate}
          </span>
        )}
      </div>

      {onUpdate && (
        <button
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-500"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ActionItem;
