/**
 * User To-Dos Storage Service
 * Manages user-created to-do items persistence - per-meeting file approach
 */

import { writeFile, readFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { pathsService } from './paths.service';
import type { StorageResult } from './types';

export interface StoredTodo {
  id: string;
  text: string;
  dueDate?: string;
  completed: boolean;
  meetingId: string;
  createdAt: string;
  updatedAt: string;
}

interface TodosFile {
  todos: StoredTodo[];
}

class TodosService {
  /**
   * Get todos file path for a meeting
   */
  private async getFilePath(meetingId: string): Promise<string> {
    const path = await pathsService.getTodosPath();
    return `${path}${meetingId}.json`;
  }

  /**
   * Load todos for a meeting
   */
  async getTodosForMeeting(meetingId: string): Promise<StorageResult<StoredTodo[]>> {
    try {
      const path = await this.getFilePath(meetingId);
      const fileExists = await exists(path);

      if (!fileExists) {
        return { success: true, data: [] };
      }

      const data = await readFile(path);
      const todosFile = JSON.parse(new TextDecoder().decode(data)) as TodosFile;
      return { success: true, data: todosFile.todos || [] };
    } catch (error) {
      console.error('[TodosService] Failed to load todos:', error);
      return { success: true, data: [] };
    }
  }

  /**
   * Save todos for a meeting
   */
  private async saveTodos(meetingId: string, todos: StoredTodo[]): Promise<StorageResult> {
    try {
      const path = await this.getFilePath(meetingId);
      console.log('[TodosService] Saving todos to:', path);

      // Ensure directory exists
      const dirPath = (await pathsService.getTodosPath()).replace(/\/$/, '');
      const dirExists = await exists(dirPath);
      if (!dirExists) {
        await mkdir(dirPath, { recursive: true });
      }

      const todosFile: TodosFile = { todos };
      await writeFile(
        path,
        new TextEncoder().encode(JSON.stringify(todosFile, null, 2))
      );

      console.log('[TodosService] ✓ Saved todos');
      return { success: true };
    } catch (error) {
      console.error('[TodosService] ❌ Failed to save todos:', error);
      return { success: false, error: `Failed to save todos: ${error}` };
    }
  }

  /**
   * Add a todo
   */
  async addTodo(meetingId: string, text: string, dueDate?: string): Promise<StorageResult<StoredTodo>> {
    console.log('[TodosService] Adding todo for meeting:', meetingId);

    const result = await this.getTodosForMeeting(meetingId);
    const todos = result.data || [];

    const newTodo: StoredTodo = {
      id: crypto.randomUUID(),
      text,
      dueDate,
      completed: false,
      meetingId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    todos.unshift(newTodo); // Add to beginning

    const saveResult = await this.saveTodos(meetingId, todos);
    if (!saveResult.success) {
      console.error('[TodosService] ✗ Failed to save todo:', saveResult.error);
      return { success: false, error: saveResult.error };
    }

    console.log('[TodosService] ✓ Todo saved successfully:', newTodo.id);
    return { success: true, data: newTodo };
  }

  /**
   * Update a todo
   */
  async updateTodo(meetingId: string, todoId: string, updates: Partial<StoredTodo>): Promise<StorageResult<StoredTodo>> {
    const result = await this.getTodosForMeeting(meetingId);
    const todos = result.data || [];

    const todoIndex = todos.findIndex(t => t.id === todoId);
    if (todoIndex === -1) {
      return { success: false, error: 'Todo not found' };
    }

    todos[todoIndex] = {
      ...todos[todoIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.saveTodos(meetingId, todos);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: todos[todoIndex] };
  }

  /**
   * Toggle todo completion
   */
  async toggleTodo(meetingId: string, todoId: string): Promise<StorageResult<StoredTodo>> {
    const result = await this.getTodosForMeeting(meetingId);
    const todos = result.data || [];

    const todo = todos.find(t => t.id === todoId);
    if (!todo) {
      return { success: false, error: 'Todo not found' };
    }

    return this.updateTodo(meetingId, todoId, { completed: !todo.completed });
  }

  /**
   * Delete a todo
   */
  async deleteTodo(meetingId: string, todoId: string): Promise<StorageResult> {
    const result = await this.getTodosForMeeting(meetingId);
    const todos = result.data || [];

    const filteredTodos = todos.filter(t => t.id !== todoId);
    return await this.saveTodos(meetingId, filteredTodos);
  }

  clearCache(): void {
    // No-op for now, can implement caching later if needed
  }
}

export const todosService = new TodosService();
