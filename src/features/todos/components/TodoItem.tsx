/**
 * TodoItem Component
 * 
 * Displays a single todo with toggle, delete, edit, and reminder functionality.
 */

import React, { useState, useCallback } from 'react';
import { Check, X, Edit2, Clock, AlertTriangle } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { ActionItem } from '@/types';
import { isOverdue, formatDueDate, formatReminderDate, isReminderOverdue } from '@shared/utils/todo.utils';
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
    <div className="px-4 py-2 group">
      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(todo.id)}
          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
            todo.completed
              ? 'bg-green-500 border-green-500 text-white'
              : `${BORDER.selectedCard} hover:border-green-400`
          }`}
        >
          {todo.completed && <Check className="w-2.5 h-2.5" />}
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
              <p className={`text-sm leading-normal break-words ${
                todo.completed
                  ? `line-through ${TEXT.faint}`
                  : TEXT.secondary
              }`}>
                {todo.text}
              </p>
              
              {/* Due date */}
              {todo.dueDate && (
                <div className={`flex items-center gap-1.5 mt-0.5 text-xs ${
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
                <div className={`flex items-center gap-1.5 mt-0.5 text-xs ${
                  isReminderOverdue(todo.reminder) ? 'text-red-500' : 'text-amber-500'
                }`}>
                  <Clock className="w-3 h-3" />
                  <span>
                    {isReminderOverdue(todo.reminder) ? 'Overdue reminder: ' : 'Reminder: '}
                    {formatReminderDate(todo.reminder.dateTime)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions — always show bell when reminder active, rest on hover */}
        <div className="flex gap-1 shrink-0">
          {/* Reminder bell — always visible when active */}
          {!isEditing && !todo.completed && onReminderChange && (
            <div className={todo.reminder ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}>
              <ReminderPicker
                todoId={todo.id}
                meetingId={meetingId}
                todoText={todo.text}
                meetingTitle={meetingTitle}
                reminderDateTime={todo.reminder?.dateTime}
                dueDate={todo.dueDate}
                onReminderSet={handleReminderSet}
              />
            </div>
          )}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
  );
};

export default TodoItem;
