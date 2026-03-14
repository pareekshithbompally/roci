/**
 * Storage Adapter Unit Tests
 * Tests for the storage adapter interface and utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setDefaultStorageAdapter,
  getStorageAdapter,
  hasStorageAdapter,
  type StorageAdapter,
  type StorageResult,
} from '@core/data/storage/storage-adapter';

// Mock implementation for testing
const createMockAdapter = (): StorageAdapter => ({
  read: vi.fn(),
  write: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
  listFiles: vi.fn(),
  getBasePath: vi.fn(),
  ensureDir: vi.fn(),
});

describe('Storage Adapter', () => {
  let mockAdapter: StorageAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    // Reset by setting a new adapter
    setDefaultStorageAdapter(mockAdapter);
  });

  describe('setDefaultStorageAdapter', () => {
    it('should set the default adapter', () => {
      const newAdapter = createMockAdapter();
      setDefaultStorageAdapter(newAdapter);
      
      expect(getStorageAdapter()).toBe(newAdapter);
    });
  });

  describe('getStorageAdapter', () => {
    it('should return the set adapter', () => {
      const result = getStorageAdapter();
      expect(result).toBe(mockAdapter);
    });
  });

  describe('hasStorageAdapter', () => {
    it('should return true when adapter is set', () => {
      expect(hasStorageAdapter()).toBe(true);
    });
  });

  describe('Mock Adapter Functionality', () => {
    it('should mock read operation', async () => {
      const testData = { id: '123', name: 'test' };
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: testData,
      } as StorageResult<typeof testData>);

      const result = await mockAdapter.read<typeof testData>('test/path');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
    });

    it('should mock write operation', async () => {
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      } as StorageResult);

      const result = await mockAdapter.write('test/path', { data: 'test' });
      
      expect(result.success).toBe(true);
    });

    it('should mock exists operation', async () => {
      (mockAdapter.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await mockAdapter.exists('test/path');
      
      expect(result).toBe(true);
    });

    it('should mock delete operation', async () => {
      (mockAdapter.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      } as StorageResult);

      const result = await mockAdapter.delete('test/path');
      
      expect(result.success).toBe(true);
    });

    it('should mock listFiles operation', async () => {
      const files = ['file1.json', 'file2.json'];
      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: files,
      } as StorageResult<string[]>);

      const result = await mockAdapter.listFiles('test/dir');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(files);
    });

    it('should mock getBasePath operation', async () => {
      (mockAdapter.getBasePath as ReturnType<typeof vi.fn>).mockResolvedValue('/app/data');

      const result = await mockAdapter.getBasePath();
      
      expect(result).toBe('/app/data');
    });

    it('should mock ensureDir operation', async () => {
      (mockAdapter.ensureDir as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      } as StorageResult);

      const result = await mockAdapter.ensureDir('new/directory');
      
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle read errors', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'File not found',
      } as StorageResult);

      const result = await mockAdapter.read('nonexistent/path');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should handle write errors', async () => {
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Permission denied',
      } as StorageResult);

      const result = await mockAdapter.write('readonly/path', { data: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should handle delete errors', async () => {
      (mockAdapter.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'File in use',
      } as StorageResult);

      const result = await mockAdapter.delete('locked/file');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('File in use');
    });
  });
});
