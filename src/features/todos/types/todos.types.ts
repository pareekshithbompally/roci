/**
 * Todos Feature Types
 * 
 * Type definitions for the todos feature module
 */

export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  meetingId: string;
  dueDate?: string;
  priority?: TodoPriority;
  createdAt: string;
  updatedAt: string;
}

export interface TodoInput {
  text: string;
  meetingId: string;
  dueDate?: string;
  priority?: TodoPriority;
}

export interface TodoStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
}

export function createTodo(input: TodoInput): Todo {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    text: input.text,
    completed: false,
    meetingId: input.meetingId,
    dueDate: input.dueDate,
    priority: input.priority,
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateTodoStats(todos: Todo[]): TodoStats {
  const now = new Date();
  return {
    total: todos.length,
    completed: todos.filter(t => t.completed).length,
    pending: todos.filter(t => !t.completed).length,
    overdue: todos.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length,
  };
}

export interface TodosState {
  todos: Todo[];
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
}

export interface TodosActions {
  loadTodos: (meetingId: string) => Promise<void>;
  addTodo: (text: string, dueDate?: string) => Promise<void>;
  updateTodo: (todoId: string, updates: { text?: string; dueDate?: string }) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  clearTodos: () => void;
  setCreating: (isCreating: boolean) => void;
}

export interface TodosContextValue extends TodosState, TodosActions {
  meetingId: string | null;
  stats: TodoStats;
  completedTodos: Todo[];
  pendingTodos: Todo[];
  overdueTodos: Todo[];
}
