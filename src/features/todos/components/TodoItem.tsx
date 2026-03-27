/**
 * TodoItem Component
 * 
 * Displays a single todo with toggle, delete, edit, and reminder functionality.
 */

import React, { useState, useCallback } from 'react';
import { Check, X, Edit2, Clock, AlertTriangle } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { ActionItem } from '@/types';
import ReminderPicker from './ReminderPicker';

interface TodoItemProps {
  todo: ActionItem;
  meetingId: string;
  meetingTitle: string;
  onToggle: (todoId: string) => void;
  onDelete?: (todoId: string) => void;
  onUpdate?: (todoId: string, updates: { text?: string; dueDate?: string }) => void;
  onReminderChange?: (todoId: string, reminderDateTime: string | null) => void;
}

const formatDueDate = (dueDate: string) => {
  // Handle both ISO dates and formatted dates like "Jan 25, 2025"
  const date = new Date(dueDate);
  if (isNaN(date.getTime())) {
    return dueDate; // Return as-is if not a valid date
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isOverdue = (dueDate?: string) => {
  if (!dueDate) return false;
  const date = new Date(dueDate);
  if (isNaN(date.getTime())) return false;
  return date < new Date();
};

const TodoItem: React.FC<TodoItemProps> = ({ todo, meetingId, meetingTitle, onToggle, onDelete, onUpdate, onReminderChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);

  const handleSave = () => {
    if (editText.trim() && onUpdate) {
      onUpdate(todo.id, { text: editText.trim() });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(todo.text);
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

  const handleReminderSet = useCallback((dateTime: string | null) => {
    onReminderChange?.(todo.id, dateTime);
  }, [todo.id, onReminderChange]);

  const overdue = !todo.completed && isOverdue(todo.dueDate);

  return (
    <div className="px-4 py-3 group">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(todo.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
            todo.completed
              ? 'bg-green-500 border-green-500 text-white'
              : `${BORDER.selectedCard} hover:border-green-400`
          }`}
        >
          {todo.completed && <Check className="w-3 h-3" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`w-full px-2 py-1 ${COMPONENT.inlineInput}`}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className={`p-1 rounded ${TEXT.muted} ${SURFACE.hoverSubtle}`}
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  className="p-1 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={`text-sm leading-relaxed break-words ${
                todo.completed
                  ? `line-through ${TEXT.faint}`
                  : TEXT.secondary
              }`}>
                {todo.text}
              </p>
              
              {/* Due date */}
              {todo.dueDate && (
                <div className={`flex items-center gap-1.5 mt-1 text-xs ${
                  overdue
                    ? 'text-red-500'
                    : todo.completed
                      ? TEXT.faint
                      : TEXT.muted
                }`}>
                  {overdue ? (
                    <AlertTriangle className="w-3 h-3" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                  <span>
                    {overdue ? 'Overdue: ' : 'Due: '}
                    {formatDueDate(todo.dueDate)}
                  </span>
                </div>
              )}

              {/* Reminder indicator */}
              {todo.reminder && !todo.completed && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-500">
                  <Clock className="w-3 h-3" />
                  <span>
                    Reminder: {new Date(todo.reminder.dateTime).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Reminder bell */}
          {!isEditing && !todo.completed && onReminderChange && (
            <ReminderPicker
              todoId={todo.id}
              meetingId={meetingId}
              todoText={todo.text}
              meetingTitle={meetingTitle}
              reminderDateTime={todo.reminder?.dateTime}
              dueDate={todo.dueDate}
              onReminderSet={handleReminderSet}
            />
          )}
          {!isEditing && onUpdate && !todo.completed && (
            <button
              onClick={() => setIsEditing(true)}
              className={`p-1 ${SURFACE.hoverSubtle} rounded ${TEXT.muted}`}
              aria-label="Edit todo"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(todo.id)}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500"
              aria-label="Delete todo"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoItem;
