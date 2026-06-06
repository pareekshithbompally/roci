/**
 * Todos Repository
 * Manages meetings/{id}/todos.json
 */

import { DocumentRepository } from './document.repository';
import { pathsService } from '../storage/paths.service';
import type { TodoEntry } from '@shared/types';

class TodosRepository extends DocumentRepository<TodoEntry[]> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('', 'todos.json');
  }

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        const meetingsDir = await join(base, 'meetings');
        this.setBasePath(meetingsDir);
      })();
    }
    return this.initPromise;
  }

  async readDoc(meetingId: string): Promise<TodoEntry[] | null> {
    await this.ensureInit();
    return super.readDoc(meetingId);
  }

  async writeDoc(meetingId: string, data: TodoEntry[]): Promise<boolean> {
    await this.ensureInit();
    return super.writeDoc(meetingId, data);
  }

  /** Add a todo */
  async addTodo(meetingId: string, todo: TodoEntry): Promise<boolean> {
    const todos = (await this.readDoc(meetingId)) || [];
    todos.unshift(todo);
    return this.writeDoc(meetingId, todos);
  }

  /** Update a todo */
  async updateTodo(meetingId: string, todoId: string, updates: Partial<TodoEntry>): Promise<boolean> {
    const todos = (await this.readDoc(meetingId)) || [];
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx === -1) return false;
    todos[idx] = { ...todos[idx], ...updates };
    return this.writeDoc(meetingId, todos);
  }

  /** Delete a todo */
  async deleteTodo(meetingId: string, todoId: string): Promise<boolean> {
    const todos = (await this.readDoc(meetingId)) || [];
    const filtered = todos.filter(t => t.id !== todoId);
    return this.writeDoc(meetingId, filtered);
  }

  /** Toggle a todo's completed state */
  async toggleTodo(meetingId: string, todoId: string): Promise<TodoEntry | null> {
    const todos = (await this.readDoc(meetingId)) || [];
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx === -1) return null;
    todos[idx] = { ...todos[idx], completed: !todos[idx].completed };
    const ok = await this.writeDoc(meetingId, todos);
    return ok ? todos[idx] : null;
  }
}

export const todosRepository = new TodosRepository();
