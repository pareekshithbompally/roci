/** A single todo with toggle, delete, edit, and reminder controls. */

import React, { useState, useCallback } from 'react';
import { Check, X, Edit2, Clock, AlertTriangle } from 'lucide-react';
import type { ActionItem } from '@shared/types';
import { isOverdue, formatDueDate, formatReminderDate, isReminderOverdue } from '@shared/utils/todo.utils';
import ReminderPicker from './ReminderPicker';
import { Checkbox, Icon, IconButton, Input, Text, cn } from '@shared/ui';

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
  const reminderOverdue = todo.reminder ? isReminderOverdue(todo.reminder) : false;

  return (
    <div className="px-4 py-2 group">
      <div className="flex items-start gap-2.5">
        <Checkbox checked={todo.completed} onCheckedChange={() => onToggle(todo.id)} className="mt-1" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <Input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <div className="flex gap-2">
                <IconButton icon={X} label="Cancel edit" size="sm" onClick={handleCancel} />
                <IconButton icon={Check} label="Save todo" size="sm" onClick={handleSave} />
              </div>
            </div>
          ) : (
            <>
              <Text as="p" variant="reading" tone={todo.completed ? 'faint' : 'muted'} className={cn('break-words', todo.completed && 'line-through')}>
                {todo.text}
              </Text>

              {/* Due date */}
              {todo.dueDate && (
                <Text as="div" variant="helper" tone={overdue ? 'danger' : todo.completed ? 'faint' : 'muted'} className="flex items-center gap-1.5 mt-0.5">
                  <Icon icon={overdue ? AlertTriangle : Clock} size="xs" />
                  <span>
                    {overdue ? 'Overdue: ' : 'Due: '}
                    {formatDueDate(todo.dueDate)}
                  </span>
                </Text>
              )}

              {/* Reminder indicator */}
              {todo.reminder && !todo.completed && (
                <Text as="div" variant="helper" tone={reminderOverdue ? 'danger' : 'warning'} className="flex items-center gap-1.5 mt-0.5">
                  <Icon icon={Clock} size="xs" />
                  <span>
                    {reminderOverdue ? 'Overdue reminder: ' : 'Reminder: '}
                    {formatReminderDate(todo.reminder.dateTime)}
                  </span>
                </Text>
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
              <IconButton icon={Edit2} label="Edit todo" size="sm" onClick={() => setIsEditing(true)} />
            )}
            {onDelete && (
              <IconButton icon={X} label="Delete todo" size="sm" variant="dangerGhost" onClick={() => onDelete(todo.id)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoItem;
