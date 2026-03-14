/**
 * Notes Repository Unit Tests
 * Tests for notes CRUD and query operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotesRepository, resetNotesRepository, getNotesRepository } from '@core/data/repositories/notes.repository';
import type { StorageAdapter, StorageResult } from '@core/data/storage/storage-adapter';
import { setDefaultStorageAdapter } from '@core/data/storage/storage-adapter';
import type { Note } from '@core/data/models/note.model';

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

describe('NotesRepository', () => {
  let mockAdapter: StorageAdapter;
  let repository: NotesRepository;

  const baseNote: Note = {
    id: 'note-123',
    meetingId: 'meeting-1',
    text: 'Test note content',
    timestamp: Date.now(),
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    resetNotesRepository();
    mockAdapter = createMockAdapter();
    setDefaultStorageAdapter(mockAdapter);
    repository = new NotesRepository({ cacheEnabled: false });
  });

  describe('getNotesForMeeting', () => {
    it('should return notes sorted by timestamp (newest first)', async () => {
      const notes = [
        { ...baseNote, id: 'note-1', timestamp: 1000 },
        { ...baseNote, id: 'note-2', timestamp: 3000 },
        { ...baseNote, id: 'note-3', timestamp: 2000 },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': notes },
      });

      const result = await repository.getNotesForMeeting('meeting-1');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('note-2'); // Newest
      expect(result[1].id).toBe('note-3');
      expect(result[2].id).toBe('note-1'); // Oldest
    });

    it('should return empty array for non-existent meeting', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });

      const result = await repository.getNotesForMeeting('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('addNote', () => {
    beforeEach(() => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });
    });

    it('should add note with string input', async () => {
      const result = await repository.addNote('meeting-1', 'New note text');

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('New note text');
      expect(result.data?.meetingId).toBe('meeting-1');
    });

    it('should add note with object input', async () => {
      const result = await repository.addNote('meeting-1', {
        text: 'New note text',
        color: '#ff0000',
        pinned: true,
        transcriptTimestamp: 120,
      });

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('New note text');
      expect(result.data?.color).toBe('#ff0000');
      expect(result.data?.pinned).toBe(true);
      expect(result.data?.transcriptTimestamp).toBe(120);
    });
  });

  describe('updateNote', () => {
    it('should update note text', async () => {
      const existingNotes = { 'meeting-1': [baseNote] };
      
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: existingNotes,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.updateNote('meeting-1', 'note-123', {
        text: 'Updated text',
      });

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Updated text');
    });
  });

  describe('deleteNote', () => {
    it('should delete note from meeting', async () => {
      const existingNotes = {
        'meeting-1': [baseNote, { ...baseNote, id: 'note-456' }],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: existingNotes,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.deleteNote('meeting-1', 'note-123');

      expect(result.success).toBe(true);
      
      const writeCall = (mockAdapter.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]['meeting-1']).toHaveLength(1);
      expect(writeCall[1]['meeting-1'][0].id).toBe('note-456');
    });
  });

  describe('togglePinned', () => {
    it('should toggle pinned status from false to true', async () => {
      const note = { ...baseNote, pinned: false };
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': [note] },
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.togglePinned('meeting-1', 'note-123');

      expect(result.success).toBe(true);
      expect(result.data?.pinned).toBe(true);
    });

    it('should return error for non-existent note', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': [] },
      });

      const result = await repository.togglePinned('meeting-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found');
    });
  });

  describe('getPinnedNotes', () => {
    it('should return only pinned notes', async () => {
      const notes = [
        { ...baseNote, id: 'note-1', pinned: true },
        { ...baseNote, id: 'note-2', pinned: false },
        { ...baseNote, id: 'note-3', pinned: true },
      ];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': notes },
      });

      const result = await repository.getPinnedNotes('meeting-1');

      expect(result).toHaveLength(2);
      expect(result.every(n => n.pinned)).toBe(true);
    });
  });

  describe('countNotes', () => {
    it('should return correct count', async () => {
      const notes = [baseNote, { ...baseNote, id: 'note-2' }, { ...baseNote, id: 'note-3' }];

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'meeting-1': notes },
      });

      const result = await repository.countNotes('meeting-1');

      expect(result).toBe(3);
    });
  });

  describe('searchNotes', () => {
    it('should find notes matching query', async () => {
      const allData = {
        'meeting-1': [
          { ...baseNote, id: 'note-1', text: 'Important meeting notes' },
          { ...baseNote, id: 'note-2', text: 'Random content' },
        ],
        'meeting-2': [
          { ...baseNote, id: 'note-3', text: 'Another important item' },
        ],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.searchNotes('important');

      expect(result).toHaveLength(2);
      expect(result.map(n => n.id).sort()).toEqual(['note-1', 'note-3'].sort());
    });

    it('should be case-insensitive', async () => {
      const allData = {
        'meeting-1': [{ ...baseNote, text: 'UPPERCASE text' }],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.searchNotes('uppercase');

      expect(result).toHaveLength(1);
    });
  });

  describe('getAllNotes', () => {
    it('should return all notes from all meetings', async () => {
      const allData = {
        'meeting-1': [{ ...baseNote, id: 'note-1' }],
        'meeting-2': [{ ...baseNote, id: 'note-2' }, { ...baseNote, id: 'note-3' }],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: allData,
      });

      const result = await repository.getAllNotes();

      expect(result).toHaveLength(3);
      expect(result.every(n => 'meetingId' in n)).toBe(true);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      resetNotesRepository();
      const instance1 = getNotesRepository();
      const instance2 = getNotesRepository();
      
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getNotesRepository();
      resetNotesRepository();
      const instance2 = getNotesRepository();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});
