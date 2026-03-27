/**
 * Todos Feature Module
 * 
 * Handles all todos-related functionality:
 * - Todo list display
 * - Add, toggle, delete todos
 * - AI-generated action items
 * - Todos linked to meetings/recordings
 * 
 * Usage:
 * ```tsx
 * import { TodosProvider, useTodos, TodoList } from '@/features/todos';
 * 
 * // Wrap your component with the provider
 * <TodosProvider meetingId={currentMeetingId}>
 *   <TodoList />
 * </TodosProvider>
 * 
 * // Or use the hook directly
 * const { todos, addTodo, toggleTodo, stats } = useTodos();
 * ```
 */

// Context
export { TodosProvider, useTodosContext } from './context';

// Hooks
export { useTodos, useGlobalTodos } from './hooks';
export type { GlobalTodo, TodoFilter } from './hooks';

// Components
export { TodoList, TodoItem, RemindersView } from './components';

// Types
export type {
  Todo,
  TodoInput,
  TodoPriority,
  TodoStats,
  TodosState,
  TodosActions,
  TodosContextValue,
} from './types';
export { createTodo, calculateTodoStats } from './types';
