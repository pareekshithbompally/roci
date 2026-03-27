/**
 * TodoList Component
 * 
 * Main todos view with list and create functionality.
 * Shows both user-created todos and AI-generated action items.
 */

import React, { useState, useCallback } from 'react';
import { Plus, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { useMeeting } from '@shared/contexts/MeetingContext';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { DatePicker, TimePicker } from '@shared/ui';
import { reminderService } from '@/services/reminder.service';
import TodoItem from './TodoItem';

interface TodoListProps {
  className?: string;
  title?: string;
}

const TodoList: React.FC<TodoListProps> = ({ className = '', title = 'To-Do List' }) => {
  const meeting = useMeeting();
  
  // Combine user todos and AI action items
  const allTodos = [
    ...(meeting.userTodos || []),
    ...(meeting.aiTodos || [])
  ];
  
  const isLoading = meeting.isLoading;
  const error = null; // Meeting context doesn't expose error for todos
  const [isCreating, setIsCreating] = useState(false);
  
  // Calculate stats from combined list
  const completedCount = allTodos.filter(todo => todo.completed).length;
  const totalCount = allTodos.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const [newItemText, setNewItemText] = useState('');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemTime, setNewItemTime] = useState('');

  const meetingId = meeting.selectedHistoryId || '';
  const meetingTitle = meeting.currentMeeting?.title || 'Meeting';

  const handleSaveItem = async () => {
    if (newItemText.trim() && meeting.selectedHistoryId) {
      let dueDateString: string | undefined;
      if (newItemDate) {
        const date = new Date(newItemDate);
        const dateStr = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        if (newItemTime) {
          dueDateString = `${dateStr} ${newItemTime}`;
        } else {
          dueDateString = dateStr;
        }
      }
      await meeting.addTodo(newItemText.trim(), dueDateString);
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
    // Update local state to reflect the reminder change without full reload
    // The reminder service already persisted the change to disk
    // Force a re-render by triggering a state update in meeting context
    if (reminderDateTime === null) {
      meeting.updateTodo(todoId, {});
    } else {
      meeting.updateTodo(todoId, {});
    }
  }, [meeting]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className={`w-6 h-6 ${TEXT.faint} animate-spin`} />
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Top action bar - always visible */}
      <div className="flex items-center gap-4">
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
              Deadline (optional)
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
                {newItemTime 
                  ? `Due: ${new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${newItemTime}`
                  : `Due: ${new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                }
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
              disabled={!newItemText.trim() || !meeting.selectedHistoryId}
              className={COMPONENT.settingsButtonPrimary}
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && !isCreating && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className={`p-3 rounded-xl ${SURFACE.subtle} mb-3`}>
            <AlertCircle className={`w-6 h-6 ${TEXT.faint}`} />
          </div>
          <p className={`text-sm ${TEXT.faint}`}>
            No to-do items yet
          </p>
        </div>
      )}

      {/* Todo items list */}
      {totalCount > 0 && (
        <div className="divide-y divide-parchment-200 dark:divide-night-800/60">
          {allTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              meetingId={meetingId}
              meetingTitle={meetingTitle}
              onToggle={todo.owner ? meeting.toggleActionItem : meeting.toggleTodo}
              onDelete={todo.owner ? undefined : meeting.deleteTodo}
              onUpdate={todo.owner ? undefined : meeting.updateTodo}
              onReminderChange={handleReminderChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TodoList;
