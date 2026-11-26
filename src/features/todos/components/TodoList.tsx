/** A meeting's to-dos (the ones typed and the AI's action items) as the To-dos screen shows them: in its sections, each a
 *  TodoRow. The meeting's + adds one (`startCreate`). */

import React from 'react';
import { ListTodo } from 'lucide-react';
import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useMeetingTodos } from '@features/todos/hooks/useMeetingTodos';
import { sectionTodos } from '@features/todos/utils/todoSections';
import { EmptyState, ScreenState } from '@shared/components';
import { Text } from '@shared/ui';
import { TodoRow } from './TodoRow';
import { TODOS_CONFIG } from '@config/todos.config';

const TodoList: React.FC = () => {
  const meetingId = useSelectedHistoryId();
  const { userTodos, aiTodos, isLoading } = useMeetingTodos(meetingId);
  const sections = sectionTodos([...userTodos, ...aiTodos]);
  return (
    <ScreenState loading={isLoading} className="flex flex-1 flex-col gap-3">
      {sections.length === 0 && <EmptyState icon={ListTodo} message={TODOS_CONFIG.page.empty.message} />}
      {sections.map((section) => (
        <section key={section.key}>
          <Text as="h2" variant="label" tone={section.key === 'overdue' ? 'danger' : 'muted'} className="px-2.5 pb-1">{section.label}</Text>
          {section.todos.map((todo) => <TodoRow key={todo.id} todo={todo} meetingId={meetingId} />)}
        </section>
      ))}
    </ScreenState>
  );
};

export default TodoList;
