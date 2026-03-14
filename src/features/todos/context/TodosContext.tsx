/**
 * Todos Context
 * 
 * Provides todos state and actions to all child components.
 * Manages todos for a specific meeting.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { todosService } from '../../../../services/storage';
import type { TodosContextValue, TodosState, Todo, TodoStats } from '../types';
import { calculateTodoStats } from '../types';

const initialState: TodosState = {
  todos: [],
  isLoading: false,
  error: null,
  isCreating: false,
};

const emptyStats: TodoStats = {
  total: 0,
  completed: 0,
  pending: 0,
  overdue: 0,
};

const TodosContext = createContext<TodosContextValue | null>(null);

export const useTodosContext = (): TodosContextValue => {
  const context = useContext(TodosContext);
  if (!context) {
    throw new Error('useTodosContext must be used within a TodosProvider');
  }
  return context;
};

interface TodosProviderProps {
  children: React.ReactNode;
  meetingId?: string | null;
}

export const TodosProvider: React.FC<TodosProviderProps> = ({ children, meetingId = null }) => {
  const [state, setState] = useState<TodosState>(initialState);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(meetingId);

  // Load todos for a meeting
  const loadTodos = useCallback(async (id: string) => {
    console.log('[TodosContext] Loading todos for meeting:', id);
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setCurrentMeetingId(id);

    try {
      const result = await todosService.getTodosForMeeting(id);
      if (result.success && result.data) {
        // Convert StoredTodo[] to Todo[] format
        const todos: Todo[] = result.data.map(t => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          dueDate: t.dueDate,
          meetingId: t.meetingId,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          version: 1,
        }));
        console.log('[TodosContext] ✓ Loaded', todos.length, 'todos');
        setState(prev => ({ ...prev, todos, isLoading: false }));
      } else {
        console.log('[TodosContext] No todos found for meeting:', id);
        setState(prev => ({ ...prev, todos: [], isLoading: false }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load todos';
      console.error('[TodosContext] ✗ Failed to load todos:', error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
    }
  }, []);

  // Auto-load todos when meetingId changes
  useEffect(() => {
    if (meetingId) {
      console.log('[TodosContext] MeetingId changed, loading todos:', meetingId);
      loadTodos(meetingId);
    } else {
      console.log('[TodosContext] No meetingId, clearing todos');
      setState(initialState);
      setCurrentMeetingId(null);
    }
  }, [meetingId, loadTodos]);

  // Add a new todo
  const addTodo = useCallback(async (text: string, dueDate?: string) => {
    if (!currentMeetingId) {
      console.warn('[TodosContext] Cannot add todo: no meeting ID');
      return;
    }

    console.log('[TodosContext] Adding todo to meeting:', currentMeetingId);

    // Create optimistic todo immediately
    const optimisticTodo: Todo = {
      id: `temp-${Date.now()}`,
      text,
      completed: false,
      dueDate,
      meetingId: currentMeetingId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // Optimistically update UI immediately
    setState(prev => ({
      ...prev,
      todos: [optimisticTodo, ...prev.todos],
      isCreating: false,
    }));

    try {
      const result = await todosService.addTodo(currentMeetingId, text, dueDate);
      if (result.success && result.data) {
        console.log('[TodosContext] ✓ Todo saved to disk:', result.data.id);
        // Replace optimistic todo with real one from server
        const realTodo: Todo = {
          id: result.data.id,
          text: result.data.text,
          completed: result.data.completed,
          dueDate: result.data.dueDate,
          meetingId: result.data.meetingId,
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
          version: 1,
        };
        
        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === optimisticTodo.id ? realTodo : t),
        }));
      } else {
        console.error('[TodosContext] ✗ Failed to save todo, rolling back');
        // Roll back optimistic update
        setState(prev => ({
          ...prev,
          todos: prev.todos.filter(t => t.id !== optimisticTodo.id),
          error: result.error,
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add todo';
      console.error('[TodosContext] ✗ Exception adding todo, rolling back:', error);
      // Roll back optimistic update
      setState(prev => ({
        ...prev,
        todos: prev.todos.filter(t => t.id !== optimisticTodo.id),
        error: errorMessage,
      }));
    }
  }, [currentMeetingId]);

  // Update a todo
  const updateTodo = useCallback(async (todoId: string, updates: { text?: string; dueDate?: string }) => {
    if (!currentMeetingId) return;

    try {
      const result = await todosService.updateTodo(currentMeetingId, todoId, updates);
      if (result.success && result.data) {
        const updatedTodo: Todo = {
          id: result.data.id,
          text: result.data.text,
          completed: result.data.completed,
          dueDate: result.data.dueDate,
          meetingId: result.data.meetingId,
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
        };

        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === todoId ? updatedTodo : t),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Delete a todo
  const deleteTodo = useCallback(async (todoId: string) => {
    if (!currentMeetingId) return;

    try {
      const result = await todosService.deleteTodo(currentMeetingId, todoId);
      if (result.success) {
        setState(prev => ({
          ...prev,
          todos: prev.todos.filter(t => t.id !== todoId),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Toggle todo completion
  const toggleTodo = useCallback(async (todoId: string) => {
    if (!currentMeetingId) return;

    try {
      const result = await todosService.toggleTodo(currentMeetingId, todoId);
      if (result.success && result.data) {
        const toggledTodo: Todo = {
          id: result.data.id,
          text: result.data.text,
          completed: result.data.completed,
          dueDate: result.data.dueDate,
          meetingId: result.data.meetingId,
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
        };

        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === todoId ? toggledTodo : t),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Clear todos
  const clearTodos = useCallback(() => {
    setState(initialState);
    setCurrentMeetingId(null);
  }, []);

  // Set creating state
  const setCreating = useCallback((isCreating: boolean) => {
    setState(prev => ({ ...prev, isCreating }));
  }, []);

  // Computed values
  const stats = useMemo(() => 
    state.todos.length > 0 ? calculateTodoStats(state.todos) : emptyStats,
    [state.todos]
  );

  const completedTodos = useMemo(() => 
    state.todos.filter(t => t.completed),
    [state.todos]
  );

  const pendingTodos = useMemo(() => 
    state.todos.filter(t => !t.completed),
    [state.todos]
  );

  const overdueTodos = useMemo(() => {
    const now = new Date();
    return state.todos.filter(t => {
      if (t.completed || !t.dueDate) return false;
      return new Date(t.dueDate) < now;
    });
  }, [state.todos]);

  const value: TodosContextValue = {
    ...state,
    meetingId: currentMeetingId,
    stats,
    completedTodos,
    pendingTodos,
    overdueTodos,
    loadTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    clearTodos,
    setCreating,
  };

  return (
    <TodosContext.Provider value={value}>
      {children}
    </TodosContext.Provider>
  );
};

export default TodosContext;
