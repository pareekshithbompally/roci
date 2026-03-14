/**
 * Todos Service
 * 
 * Business logic layer for todos operations.
 * Wraps the storage service with validation.
 */

import { todosService as storageService } from '../../../../services/storage';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  meetingId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddTodoResult {
  success: boolean;
  todo?: Todo;
  error?: string;
}

class TodosFeatureService {
  /**
   * Get todos for a meeting
   */
  async getTodosForMeeting(meetingId: string): Promise<Todo[]> {
    const result = await storageService.getTodosForMeeting(meetingId);
    if (result.success && result.data) {
      return result.data.map(t => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
        dueDate: t.dueDate,
        meetingId: t.meetingId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    }
    return [];
  }

  /**
   * Add a new todo
   */
  async addTodo(meetingId: string, text: string, dueDate?: string): Promise<AddTodoResult> {
    // Validate input
    if (!text.trim()) {
      return { success: false, error: 'Todo text cannot be empty' };
    }

    if (!meetingId) {
      return { success: false, error: 'Meeting ID is required' };
    }

    const result = await storageService.addTodo(meetingId, text.trim(), dueDate);
    
    if (result.success && result.data) {
      const todo: Todo = {
        id: result.data.id,
        text: result.data.text,
        completed: result.data.completed,
        dueDate: result.data.dueDate,
        meetingId: result.data.meetingId,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      };

      return { success: true, todo };
    }

    return { success: false, error: result.error || 'Failed to add todo' };
  }

  /**
   * Update a todo
   */
  async updateTodo(
    meetingId: string, 
    todoId: string, 
    updates: { text?: string; dueDate?: string }
  ): Promise<AddTodoResult> {
    const result = await storageService.updateTodo(meetingId, todoId, updates);
    
    if (result.success && result.data) {
      const todo: Todo = {
        id: result.data.id,
        text: result.data.text,
        completed: result.data.completed,
        dueDate: result.data.dueDate,
        meetingId: result.data.meetingId,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      };

      return { success: true, todo };
    }

    return { success: false, error: result.error || 'Failed to update todo' };
  }

  /**
   * Toggle todo completion
   */
  async toggleTodo(meetingId: string, todoId: string): Promise<AddTodoResult> {
    const result = await storageService.toggleTodo(meetingId, todoId);
    
    if (result.success && result.data) {
      const todo: Todo = {
        id: result.data.id,
        text: result.data.text,
        completed: result.data.completed,
        dueDate: result.data.dueDate,
        meetingId: result.data.meetingId,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      };

      return { success: true, todo };
    }

    return { success: false, error: result.error || 'Failed to toggle todo' };
  }

  /**
   * Delete a todo
   */
  async deleteTodo(meetingId: string, todoId: string): Promise<{ success: boolean; error?: string }> {
    const result = await storageService.deleteTodo(meetingId, todoId);
    return result;
  }
}

// Singleton instance
export const todosFeatureService = new TodosFeatureService();
export default todosFeatureService;
