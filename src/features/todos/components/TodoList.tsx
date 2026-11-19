/** Todos view listing user-created todos and AI-generated action items; the tab bar's Add opens its create form. */

import React, { useCallback } from 'react';
import { ListTodo, Loader2 } from 'lucide-react';
import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useMeetingTodos } from '@features/todos/hooks/useMeetingTodos';
import { EmptyState } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { Icon, Progress, Separator, Text, cn } from '@shared/ui';
import TodoItem from './TodoItem';
import { NewTodoForm } from './NewTodoForm';

interface TodoListProps {
  /** The create form is open (the meeting's tab bar Add opens it). */
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  className?: string;
}

const TodoList: React.FC<TodoListProps> = ({ creating, onCreatingChange, className = '' }) => {
  const selectedHistoryId = useSelectedHistoryId();
  const { items } = useHistoryData();
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
  
  // Calculate stats from combined list
  const completedCount = allTodos.filter(todo => todo.completed).length;
  const totalCount = allTodos.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const meetingId = selectedHistoryId || '';
  const meetingTitle = items.find((item) => item.id === selectedHistoryId)?.title || 'Meeting';

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

      {/* New to-do: the shared form (a sheet on iPhone), fixed to this meeting. */}
      <NewTodoForm
        open={creating}
        onClose={() => onCreatingChange(false)}
        meetingId={meetingId}
        onSubmit={(_meeting, text, dueDate) => addTodo(text, dueDate)}
      />

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
