/**
 * Data Model Unit Tests
 * Tests for model creation and utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBaseModel, touchModel, type BaseModel } from '@core/data/models/base.model';
import { createNote, type Note } from '@core/data/models/note.model';
import { createTodo, calculateTodoStats, type Todo } from '@core/data/models/todo.model';

describe('BaseModel', () => {
  describe('createBaseModel', () => {
    it('should create model with auto-generated id', () => {
      const model = createBaseModel();
      
      expect(model.id).toBeDefined();
      expect(model.id.length).toBeGreaterThan(0);
    });

    it('should create model with provided id', () => {
      const model = createBaseModel('custom-id-123');
      
      expect(model.id).toBe('custom-id-123');
    });

    it('should set createdAt and updatedAt to same value', () => {
      const model = createBaseModel();
      
      expect(model.createdAt).toBe(model.updatedAt);
    });

    it('should set version to 1', () => {
      const model = createBaseModel();
      
      expect(model.version).toBe(1);
    });

    it('should create valid ISO timestamp', () => {
      const model = createBaseModel();
      const date = new Date(model.createdAt);
      
      expect(date.toISOString()).toBe(model.createdAt);
    });
  });

  describe('touchModel', () => {
    it('should update updatedAt timestamp', async () => {
      const model = createBaseModel();
      const originalUpdatedAt = model.updatedAt;
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const touched = touchModel(model);
      
      expect(touched.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should preserve other fields', () => {
      const model = createBaseModel('test-id');
      const touched = touchModel(model);
      
      expect(touched.id).toBe('test-id');
      expect(touched.createdAt).toBe(model.createdAt);
      expect(touched.version).toBe(model.version);
    });

    it('should return new object (immutable)', () => {
      const model = createBaseModel();
      const touched = touchModel(model);
      
      expect(touched).not.toBe(model);
    });
  });
});

describe('Note Model', () => {
  describe('createNote', () => {
    it('should create note with required fields', () => {
      const note = createNote({
        meetingId: 'meeting-123',
        text: 'This is a test note',
      });

      expect(note.id).toBeDefined();
      expect(note.meetingId).toBe('meeting-123');
      expect(note.text).toBe('This is a test note');
      expect(note.timestamp).toBeDefined();
      expect(note.version).toBe(1);
    });

    it('should set timestamp to current time', () => {
      const before = Date.now();
      const note = createNote({
        meetingId: 'meeting-123',
        text: 'Test',
      });
      const after = Date.now();

      expect(note.timestamp).toBeGreaterThanOrEqual(before);
      expect(note.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include optional transcriptTimestamp', () => {
      const note = createNote({
        meetingId: 'meeting-123',
        text: 'Test',
        transcriptTimestamp: 120,
      });

      expect(note.transcriptTimestamp).toBe(120);
    });

    it('should leave transcriptTimestamp undefined when not provided', () => {
      const note = createNote({
        meetingId: 'meeting-123',
        text: 'Test',
      });

      expect(note.transcriptTimestamp).toBeUndefined();
    });
  });
});

describe('Todo Model', () => {
  describe('createTodo', () => {
    it('should create todo with required fields', () => {
      const todo = createTodo({
        meetingId: 'meeting-123',
        text: 'Complete the task',
      });

      expect(todo.id).toBeDefined();
      expect(todo.meetingId).toBe('meeting-123');
      expect(todo.text).toBe('Complete the task');
      expect(todo.completed).toBe(false);
      expect(todo.priority).toBe('medium'); // Default
      expect(todo.version).toBe(1);
    });

    it('should set custom priority', () => {
      const todo = createTodo({
        meetingId: 'meeting-123',
        text: 'Urgent task',
        priority: 'high',
      });

      expect(todo.priority).toBe('high');
    });

    it('should set due date', () => {
      const todo = createTodo({
        meetingId: 'meeting-123',
        text: 'Task with deadline',
        dueDate: '2024-12-31',
      });

      expect(todo.dueDate).toBe('2024-12-31');
    });

    it('should mark as AI generated', () => {
      const todo = createTodo({
        meetingId: 'meeting-123',
        text: 'AI suggested task',
        aiGenerated: true,
      });

      expect(todo.aiGenerated).toBe(true);
    });
  });

  describe('calculateTodoStats', () => {
    it('should calculate correct stats for empty array', () => {
      const stats = calculateTodoStats([]);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.overdue).toBe(0);
    });

    it('should calculate correct counts', () => {
      const todos: Todo[] = [
        { ...createTodo({ meetingId: '1', text: '1' }), completed: false },
        { ...createTodo({ meetingId: '1', text: '2' }), completed: true },
        { ...createTodo({ meetingId: '1', text: '3' }), completed: false },
        { ...createTodo({ meetingId: '1', text: '4' }), completed: true },
        { ...createTodo({ meetingId: '1', text: '5' }), completed: true },
      ];

      const stats = calculateTodoStats(todos);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(3);
      expect(stats.pending).toBe(2);
    });

    it('should identify overdue todos', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000).toISOString(); // Yesterday
      const futureDate = new Date(now.getTime() + 86400000).toISOString(); // Tomorrow

      const todos: Todo[] = [
        { ...createTodo({ meetingId: '1', text: '1', dueDate: pastDate }), completed: false }, // Overdue
        { ...createTodo({ meetingId: '1', text: '2', dueDate: pastDate }), completed: true },  // Not overdue (completed)
        { ...createTodo({ meetingId: '1', text: '3', dueDate: futureDate }), completed: false }, // Not overdue (future)
        { ...createTodo({ meetingId: '1', text: '4' }), completed: false }, // Not overdue (no due date)
      ];

      const stats = calculateTodoStats(todos);

      expect(stats.overdue).toBe(1);
    });

    it('should not count completed todos as overdue', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      const todos: Todo[] = [
        { ...createTodo({ meetingId: '1', text: '1', dueDate: pastDate }), completed: true },
      ];

      const stats = calculateTodoStats(todos);

      expect(stats.overdue).toBe(0);
    });
  });
});
