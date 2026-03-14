/**
 * Todos Repository Unit Tests
 * Tests for todos CRUD and query operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TodosRepository, resetTodosRepository, getTodosRepository } from '@core/data/repositories/todos.repository';
import type { StorageAdapter, StorageResult } from '@core/data/storage/storage-adapter';
import { setDefaultStorageAdapter } from '@core/data/storage/storage-adapter';
import type { Todo } from '@core/data/models/todo.model';

// Create mock adapter
const createMockAdapter = (): StorageAdapter => ({
  read: vi.fn(),
  write: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
  listFiles: vi.fn(),
  getBasePath: vi.fn(),
  ensureDir: vi.fn(),
});

describe('TodosRepository', () => {
  let mockAdapter: StorageAdapter;
  let repository: TodosRepository;

  const baseTodo: Todo = {
    id: 'todo-123',
    meetingId: 'meeting-1',
    text: 'Test todo item',
    completed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    resetTodosRepository();
    mockAdapter = createMockAdapter();
    setDefaultStorageAdapter(mockAdapter);
    repository = new TodosRepository({ cacheEnabled: false });
  });

  describe('getTodosForMeeting', () => {
    it('should return todos with incomplete first', async () => {
      const todos = [
        { ...baseTodo, id: 'todo-1', completed: true },
        { ...baseTodo, id: 'todo-2', completed: false },
        { ...baseTodo, id: 'todo-3', completed: true },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const result = await repository.getTodosForMeeting('meeting-1');

      expect(result).toHaveLength(3);
      expect(result[0].completed).toBe(false); // Incomplete first
      expect(result[1].completed).toBe(true);
      expect(result[2].completed).toBe(true);
    });

    it('should return empty array for non-existent meeting', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });

      const result = await repository.getTodosForMeeting('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('addTodo', () => {
    beforeEach(() => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });
    });

    it('should add todo with string input', async () => {
      const result = await repository.addTodo('meeting-1', 'New todo text');

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('New todo text');
      expect(result.data?.meetingId).toBe('meeting-1');
      expect(result.data?.completed).toBe(false);
    });

    it('should add todo with object input', async () => {
      const result = await repository.addTodo('meeting-1', {
        text: 'New todo text',
        dueDate: '2024-12-31',
        priority: 'high',
        notes: 'Some notes',
      });

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('New todo text');
      expect(result.data?.dueDate).toBe('2024-12-31');
      expect(result.data?.priority).toBe('high');
      expect(result.data?.notes).toBe('Some notes');
    });
  });

  describe('addActionItem', () => {
    beforeEach(() => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });
    });

    it('should add AI-generated action item', async () => {
      const result = await repository.addActionItem(
        'meeting-1',
        'Follow up with client',
        '2024-12-31'
      );

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Follow up with client');
      expect(result.data?.aiGenerated).toBe(true);
      expect(result.data?.dueDate).toBe('2024-12-31');
    });
  });

  describe('toggleTodo', () => {
    it('should toggle from incomplete to complete', async () => {
      const todo = { ...baseTodo, completed: false };
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': [todo] },
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.toggleTodo('meeting-1', 'todo-123');

      expect(result.success).toBe(true);
      expect(result.data?.completed).toBe(true);
      expect(result.data?.completedAt).toBeDefined();
    });

    it('should toggle from complete to incomplete', async () => {
      const todo = { ...baseTodo, completed: true, completedAt: '2024-01-15T00:00:00.000Z' };
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': [todo] },
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.toggleTodo('meeting-1', 'todo-123');

      expect(result.success).toBe(true);
      expect(result.data?.completed).toBe(false);
    });

    it('should return error for non-existent todo', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': [] },
      });

      const result = await repository.toggleTodo('meeting-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Todo not found');
    });
  });

  describe('getStats', () => {
    it('should calculate correct statistics', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000).toISOString(); // Yesterday
      
      const todos = [
        { ...baseTodo, id: '1', completed: false },
        { ...baseTodo, id: '2', completed: true },
        { ...baseTodo, id: '3', completed: false, dueDate: pastDate }, // Overdue
        { ...baseTodo, id: '4', completed: true },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const stats = await repository.getStats('meeting-1');

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(2);
      expect(stats.overdue).toBe(1);
    });
  });

  describe('getPendingTodos', () => {
    it('should return only incomplete todos sorted by priority', async () => {
      const todos = [
        { ...baseTodo, id: '1', completed: false, priority: 'low' as const },
        { ...baseTodo, id: '2', completed: true, priority: 'high' as const },
        { ...baseTodo, id: '3', completed: false, priority: 'high' as const },
        { ...baseTodo, id: '4', completed: false, priority: 'medium' as const },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const result = await repository.getPendingTodos('meeting-1');

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('medium');
      expect(result[2].priority).toBe('low');
    });

    it('should sort by due date within same priority', async () => {
      const todos = [
        { ...baseTodo, id: '1', completed: false, priority: 'medium' as const, dueDate: '2024-12-31' },
        { ...baseTodo, id: '2', completed: false, priority: 'medium' as const, dueDate: '2024-12-15' },
        { ...baseTodo, id: '3', completed: false, priority: 'medium' as const }, // No due date
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const result = await repository.getPendingTodos('meeting-1');

      expect(result[0].id).toBe('2'); // Earlier due date
      expect(result[1].id).toBe('1'); // Later due date
      expect(result[2].id).toBe('3'); // No due date last
    });
  });

  describe('getOverdueTodos', () => {
    it('should return only overdue incomplete todos', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000).toISOString();
      const futureDate = new Date(now.getTime() + 86400000).toISOString();

      const todos = [
        { ...baseTodo, id: '1', completed: false, dueDate: pastDate }, // Overdue
        { ...baseTodo, id: '2', completed: false, dueDate: futureDate }, // Not overdue
        { ...baseTodo, id: '3', completed: true, dueDate: pastDate }, // Completed, not overdue
        { ...baseTodo, id: '4', completed: false }, // No due date
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const result = await repository.getOverdueTodos('meeting-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('getAllPendingTodos', () => {
    it('should return pending todos from all meetings', async () => {
      const allData = {
        'meeting-1': [
          { ...baseTodo, id: '1', completed: false },
          { ...baseTodo, id: '2', completed: true },
        ],
        'meeting-2': [
          { ...baseTodo, id: '3', completed: false },
        ],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.getAllPendingTodos();

      expect(result).toHaveLength(2);
      expect(result.every(t => !t.completed)).toBe(true);
      expect(result.every(t => 'meetingId' in t)).toBe(true);
    });
  });

  describe('searchTodos', () => {
    it('should find todos matching query in text', async () => {
      const allData = {
        'meeting-1': [
          { ...baseTodo, id: '1', text: 'Review the document' },
          { ...baseTodo, id: '2', text: 'Send email' },
        ],
        'meeting-2': [
          { ...baseTodo, id: '3', text: 'Document findings' },
        ],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.searchTodos('document');

      expect(result).toHaveLength(2);
    });

    it('should find todos matching query in notes', async () => {
      const allData = {
        'meeting-1': [
          { ...baseTodo, id: '1', text: 'Task 1', notes: 'Important project details' },
        ],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.searchTodos('project');

      expect(result).toHaveLength(1);
    });
  });

  describe('countTodos', () => {
    it('should return total and pending counts', async () => {
      const todos = [
        { ...baseTodo, id: '1', completed: false },
        { ...baseTodo, id: '2', completed: true },
        { ...baseTodo, id: '3', completed: false },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': todos },
      });

      const result = await repository.countTodos('meeting-1');

      expect(result.total).toBe(3);
      expect(result.pending).toBe(2);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      resetTodosRepository();
      const instance1 = getTodosRepository();
      const instance2 = getTodosRepository();
      
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getTodosRepository();
      resetTodosRepository();
      const instance2 = getTodosRepository();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});
