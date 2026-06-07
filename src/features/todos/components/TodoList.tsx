/**
 * TodoList Component
 * 
 * Main todos view with list and create functionality.
 * Shows both user-created todos and AI-generated action items.
 */

import React, { useState, useCallback } from 'react';
import { Plus, ListTodo, Loader2, Calendar } from 'lucide-react';
import { useSelectedHistoryId, useAppResult } from '@shared/stores/appStore';
import { useMeetingTodos } from '../hooks/useMeetingTodos';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import EmptyState from '@shared/components/EmptyState';
import { DatePicker, TimePicker } from '@shared/ui';
import { reminderService } from '@services/reminder.service';
import { buildISOFromDateInput } from '@shared/utils/todo.utils';
import TodoItem from './TodoItem';

interface TodoListProps {
  className?: string;
  title?: string;
}

const TodoList: React.FC<TodoListProps> = ({ className = '', title = 'To-Do List' }) => {
  const selectedHistoryId = useSelectedHistoryId();
  const result = useAppResult();
  const { userTodos, aiTodos, isLoading, addTodo, updateTodo, deleteTodo, toggleTodo } = useMeetingTodos(selectedHistoryId);
  
  // Combine user todos and AI action items
  const allTodos = [
    ...(userTodos || []),
    ...(aiTodos || [])
  ];
  
  const [newItemText, setNewItemText] = useState('');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemTime, setNewItemTime] = useState('');
  const error = null;
  const [isCreating, setIsCreating] = useState(false);
  
  // Calculate stats from combined list
  const completedCount = allTodos.filter(todo => todo.completed).length;
  const totalCount = allTodos.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const meetingId = selectedHistoryId || '';
  const meetingTitle = result?.title || 'Meeting';

  const handleSaveItem = async () => {
    if (newItemText.trim() && selectedHistoryId) {
      const dueDateString = newItemDate
        ? buildISOFromDateInput(newItemDate, newItemTime || undefined)
        : undefined;
      await addTodo(newItemText.trim(), dueDateString);
      setNewItemText('');
      setNewItemDate('');
      setNewItemTime('');
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setNewItemText('');
    setNewItemDate('');
    setNewItemTime('');
    setIsCreating(false);
  };

  const handleReminderChange = useCallback((todoId: string, reminderDateTime: string | null) => {
    updateTodo(todoId, {});
  }, [updateTodo]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className={`w-6 h-6 ${TEXT.faint} animate-spin`} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-full gap-y-5 ${className}`}>
      {/* Top action bar - always visible */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Progress section - only show if there are items */}
        {totalCount > 0 && (
          <div className="flex items-center gap-3 flex-1">
            <span className={`text-xs font-medium ${TEXT.muted} whitespace-nowrap`}>
              {completedCount}/{totalCount} done
            </span>
            <div className={`w-32 h-1.5 ${SURFACE.chip} rounded-full overflow-hidden`}>
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {/* Spacer when no items */}
        {totalCount === 0 && <div className="flex-1" />}
        {/* Add button - always on the right */}
        <button
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          className={`${COMPONENT.settingsButtonPrimary} ml-auto`}
        >
          <Plus className="w-3.5 h-3.5" />
          Add To-Do
        </button>
      </div>

      {/* New to-do input */}
      {isCreating && (
        <div className={`rounded-xl border ${BORDER.default} ${SURFACE.subtle} p-4 space-y-3 animate-fade-in`}>
          <textarea
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="What do you need to do?"
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className={`w-full h-16 p-3 ${COMPONENT.inlineInput} resize-none`}
            autoFocus
          />

          {/* Deadline picker */}
          <div className="space-y-2">
            <label className={`text-xs font-medium ${TEXT.secondary} flex items-center gap-1.5`}>
              <Calendar className="w-3.5 h-3.5" />
              Due date (optional)
            </label>
            <div className="flex gap-2 items-center">
              <DatePicker
                value={newItemDate}
                onChange={(val) => setNewItemDate(val)}
                min={new Date().toISOString().split('T')[0]}
                placeholder="Pick a date"
                className="flex-1"
              />
              <TimePicker
                value={newItemTime || '09:00'}
                onChange={(val) => setNewItemTime(val)}
                disabled={!newItemDate}
                className="w-[110px]"
              />
            </div>
            {newItemDate && (
              <div className={`text-xs ${TEXT.muted}`}>
                Due: {new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {newItemTime ? ` at ${newItemTime}` : ''}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={handleCancel}
              className={COMPONENT.settingsButtonOutline}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveItem}
              disabled={!newItemText.trim() || !selectedHistoryId}
              className={COMPONENT.settingsButtonPrimary}
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
        </div>
      )}

      {/* Content: empty state or item list */}
      {totalCount === 0 && !isCreating ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={ListTodo} message="No to-do items yet" />
        </div>
      ) : totalCount > 0 ? (
        <div className="divide-y divide-parchment-200 dark:divide-night-800/60">
          {allTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              meetingId={meetingId}
              meetingTitle={meetingTitle}
              onToggle={toggleTodo}
              onDelete={todo.owner ? undefined : deleteTodo}
              onUpdate={todo.owner ? undefined : updateTodo}
              onReminderChange={handleReminderChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default TodoList;
