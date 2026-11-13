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
 * import { TodoList } from '@/features/todos';
 * 
 * <TodoList />
 * ```
 */

// Hooks
export { useGlobalTodos } from './hooks';
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
} from './types';
