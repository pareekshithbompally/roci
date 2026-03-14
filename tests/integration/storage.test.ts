/**
 * Storage Services Integration Tests
 * 
 * These tests verify that storage services work correctly.
 * Critical for ensuring data integrity during refactoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Note: These are integration tests that will be expanded as we refactor.
// For now, they serve as smoke tests for the storage services.

describe('Storage Services', () => {
  describe('History Service', () => {
    it('should be importable', async () => {
      const { historyService } = await import('@/services/storage/history.service');
      expect(historyService).toBeDefined();
      expect(typeof historyService.load).toBe('function');
      expect(typeof historyService.save).toBe('function');
    });
  });

  describe('Notes Service', () => {
    it('should be importable', async () => {
      const { notesService } = await import('@/services/storage/notes.service');
      expect(notesService).toBeDefined();
      expect(typeof notesService.loadAll).toBe('function');
      expect(typeof notesService.addNote).toBe('function');
      expect(typeof notesService.deleteNote).toBe('function');
    });
  });

  describe('Todos Service', () => {
    it('should be importable', async () => {
      const { todosService } = await import('@/services/storage/todos.service');
      expect(todosService).toBeDefined();
      expect(typeof todosService.loadAll).toBe('function');
      expect(typeof todosService.addTodo).toBe('function');
      expect(typeof todosService.deleteTodo).toBe('function');
    });
  });

  describe('Settings Service', () => {
    it('should be importable', async () => {
      const { settingsService } = await import('@/services/storage/settings.service');
      expect(settingsService).toBeDefined();
      expect(typeof settingsService.load).toBe('function');
      expect(typeof settingsService.save).toBe('function');
    });
  });

  describe('Chats Service', () => {
    it('should be importable', async () => {
      const { chatsService } = await import('@/services/storage/chats.service');
      expect(chatsService).toBeDefined();
      expect(typeof chatsService.saveChat).toBe('function');
      expect(typeof chatsService.listChats).toBe('function');
    });
  });
});
