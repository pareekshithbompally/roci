/** Todos view listing user-created todos and AI-generated action items; the tab bar's Add opens its create form. */

import React, { useState, useCallback } from 'react';
import { Plus, ListTodo, Loader2, Calendar } from 'lucide-react';
import { useSelectedHistoryId, useAppResult } from '@shared/stores/appStore';
import { useMeetingTodos } from '@features/todos/hooks/useMeetingTodos';
import { EmptyState } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { Button, DatePicker, Icon, Progress, Separator, Surface, Text, TimePicker, Textarea, cn } from '@shared/ui';
import { buildISOFromDateInput } from '@shared/utils/todo.utils';
import TodoItem from './TodoItem';

interface TodoListProps {
  /** The create form is open (the meeting's tab bar Add opens it). */
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  className?: string;
}

const TodoList: React.FC<TodoListProps> = ({ creating, onCreatingChange, className = '' }) => {
  const selectedHistoryId = useSelectedHistoryId();
  const result = useAppResult();
  const { userTodos, aiTodos, isLoading, addTodo, updateTodo, deleteTodo, toggleTodo } = useMeetingTodos(selectedHistoryId);

  const handleDeleteTodo = async (todoId: string) => {
    if (!(await confirmDelete('to-do'))) return;
    await deleteTodo(todoId).catch((err: unknown) => console.error('[TodoList] Delete failed:', err));
  };
  
  // Combine user todos and AI action items
  const allTodos = [
    ...(userTodos || []),
    ...(aiTodos || [])
  ];
  
  const [newItemText, setNewItemText] = useState('');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemTime, setNewItemTime] = useState('');
  
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
      onCreatingChange(false);
    }
  };

  const handleCancel = () => {
    setNewItemText('');
    setNewItemDate('');
    setNewItemTime('');
    onCreatingChange(false);
  };

  const handleReminderChange = useCallback((todoId: string, reminderDateTime: string | null) => {
    updateTodo(todoId, {});
  }, [updateTodo]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Icon icon={Loader2} size="lg" tone="faint" className="animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col gap-y-5', className)}>
      {/* Progress, once there's something to track */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 shrink-0">
          <Text variant="label" tone="muted" className="whitespace-nowrap">
            {completedCount}/{totalCount} done
          </Text>
          <Progress percent={progress} tone="success" className="w-32" />
        </div>
      )}

      {/* New to-do input */}
      {creating && (
        <Surface variant="subtle" radius="xl" edge="all" className="p-4 space-y-3 animate-fade-in">
          <Textarea
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="What do you need to do?"
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className="h-16"
            autoFocus
          />

          {/* Deadline picker */}
          <div className="space-y-2">
            <Text as="label" variant="label" tone="muted" className="flex items-center gap-1.5">
              <Icon icon={Calendar} size="xs" />
              Due date (optional)
            </Text>
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
                className="w-28"
              />
            </div>
            {newItemDate && (
              <Text as="div" variant="helper" tone="muted">
                Due: {new Date(newItemDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {newItemTime ? ` at ${newItemTime}` : ''}
              </Text>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveItem}
              disabled={!newItemText.trim() || !selectedHistoryId}>
              <Icon icon={Plus} size="xs" />
              Create
            </Button>
          </div>
        </Surface>
      )}

      {/* Content: empty state or item list */}
      {totalCount === 0 && !creating ? (
        <EmptyState icon={ListTodo} message="No to-do items yet" />
      ) : totalCount > 0 ? (
        <div>
          {allTodos.map((todo, i) => (
            <React.Fragment key={todo.id}>
              {i > 0 && <Separator />}
              <TodoItem
                todo={todo}
                meetingId={meetingId}
                meetingTitle={meetingTitle}
                onToggle={toggleTodo}
                onDelete={todo.owner ? undefined : (todoId) => void handleDeleteTodo(todoId)}
                onUpdate={todo.owner ? undefined : updateTodo}
                onReminderChange={handleReminderChange}
              />
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default TodoList;
