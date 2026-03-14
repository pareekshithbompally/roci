/**
 * useTodos Hook
 * 
 * Main hook for accessing todos functionality.
 * Wraps the TodosContext for convenient usage.
 */

import { useTodosContext } from '../context';

export const useTodos = () => {
  const context = useTodosContext();
  
  return {
    // State
    todos: context.todos,
    isLoading: context.isLoading,
    error: context.error,
    isCreating: context.isCreating,
    meetingId: context.meetingId,
    
    // Computed
    stats: context.stats,
    completedTodos: context.completedTodos,
    pendingTodos: context.pendingTodos,
    overdueTodos: context.overdueTodos,
    hasTodos: context.todos.length > 0,
    
    // Actions
    loadTodos: context.loadTodos,
    addTodo: context.addTodo,
    updateTodo: context.updateTodo,
    deleteTodo: context.deleteTodo,
    toggleTodo: context.toggleTodo,
    clearTodos: context.clearTodos,
    setCreating: context.setCreating,
  };
};

export default useTodos;
