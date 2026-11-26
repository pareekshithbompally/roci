/** A meeting's to-dos: the ones typed and the AI's action items. The meeting's + adds one (`startCreate`). */

import React from 'react';
import { ListTodo } from 'lucide-react';
import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { useMeetingTodos } from '@features/todos/hooks/useMeetingTodos';
import { EmptyState, ScreenState } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { TODOS_CONFIG } from '@config/todos.config';
import { Progress, Separator, Text, cn, showToast } from '@shared/ui';
import TodoItem from './TodoItem';

interface TodoListProps {
  className?: string;
}

const TodoList: React.FC<TodoListProps> = ({ className = '' }) => {
  const selectedHistoryId = useSelectedHistoryId();
  const meeting = useMeetingBrief(selectedHistoryId);
  const { userTodos, aiTodos, isLoading, updateTodo, deleteTodo, toggleTodo, refresh } = useMeetingTodos(selectedHistoryId);

  const handleDeleteTodo = async (todoId: string) => {
    if (!(await confirmDelete('to-do'))) return;
    await deleteTodo(todoId).catch((err: unknown) => {
      console.error('[TodoList] Delete failed:', err);
      showToast(TODOS_CONFIG.deleteFailed, 'error');
    });
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
  const meetingTitle = meeting?.title || 'Meeting';

  return (
    <ScreenState loading={isLoading} className={cn('flex flex-1 flex-col gap-y-5', className)}>
      {/* Progress, once there's something to track */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 shrink-0">
          <Text variant="label" tone="muted" className="whitespace-nowrap">
            {completedCount}/{totalCount} done
          </Text>
          <Progress percent={progress} tone="success" className="w-32" />
        </div>
      )}

      {/* Content: empty state or item list */}
      {totalCount === 0 ? (
        <EmptyState icon={ListTodo} message="No to-do items yet" />
      ) : (
        <div>
          {allTodos.map((todo, i) => (
            <React.Fragment key={todo.id}>
              {i > 0 && <Separator />}
              <TodoItem
                todo={todo}
                meetingId={meetingId}
                meetingTitle={meetingTitle}
                onToggle={toggleTodo}
                onDelete={(todoId) => void handleDeleteTodo(todoId)}
                onUpdate={updateTodo}
                onReminderChange={refresh}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </ScreenState>
  );
};

export default TodoList;
