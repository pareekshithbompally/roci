/**
 * Base Repository Unit Tests
 * Tests for the abstract repository patterns
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseRepository, GroupedRepository, type RepositoryOptions, type QueryOptions } from '@core/data/repositories/base.repository';
import type { StorageAdapter, StorageResult } from '@core/data/storage/storage-adapter';
import { setDefaultStorageAdapter } from '@core/data/storage/storage-adapter';
import type { BaseModel } from '@core/data/models/base.model';

// Test entity interface
interface TestEntity extends BaseModel {
  name: string;
  value: number;
}

// Concrete implementation for testing BaseRepository
class TestRepository extends BaseRepository<TestEntity> {
  protected getStoragePath(): string {
    return 'test-entities';
  }
}

// Concrete implementation for testing GroupedRepository
class TestGroupedRepository extends GroupedRepository<TestEntity> {
  protected getStoragePath(): string {
    return 'grouped-entities.json';
  }
}

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

describe('BaseRepository', () => {
  let mockAdapter: StorageAdapter;
  let repository: TestRepository;

  const testEntity: TestEntity = {
    id: 'entity-123',
    name: 'Test Entity',
    value: 42,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    setDefaultStorageAdapter(mockAdapter);
    repository = new TestRepository({ cacheEnabled: false });
  });

  describe('findById', () => {
    it('should return entity when found', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: testEntity,
      } as StorageResult<TestEntity>);

      const result = await repository.findById('entity-123');

      expect(result).toEqual(testEntity);
      expect(mockAdapter.read).toHaveBeenCalledWith('test-entities/entity-123.json');
    });

    it('should return null when not found', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Not found',
      } as StorageResult<TestEntity>);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all entities', async () => {
      const entities = [
        { ...testEntity, id: '1', name: 'Entity 1' },
        { ...testEntity, id: '2', name: 'Entity 2' },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json'],
      });

      (mockAdapter.read as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ success: true, data: entities[0] })
        .mockResolvedValueOnce({ success: true, data: entities[1] });

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Entity 1');
      expect(result[1].name).toBe('Entity 2');
    });

    it('should return empty array when directory is empty', async () => {
      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should apply filter option', async () => {
      const entities = [
        { ...testEntity, id: '1', name: 'Entity 1', value: 10 },
        { ...testEntity, id: '2', name: 'Entity 2', value: 50 },
        { ...testEntity, id: '3', name: 'Entity 3', value: 30 },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json', '3.json'],
      });

      (mockAdapter.read as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ success: true, data: entities[0] })
        .mockResolvedValueOnce({ success: true, data: entities[1] })
        .mockResolvedValueOnce({ success: true, data: entities[2] });

      const result = await repository.findAll({
        filter: (item) => item.value > 20,
      });

      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['2', '3']);
    });

    it('should apply sort option', async () => {
      const entities = [
        { ...testEntity, id: '1', name: 'Charlie', value: 10 },
        { ...testEntity, id: '2', name: 'Alice', value: 50 },
        { ...testEntity, id: '3', name: 'Bob', value: 30 },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json', '3.json'],
      });

      (mockAdapter.read as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ success: true, data: entities[0] })
        .mockResolvedValueOnce({ success: true, data: entities[1] })
        .mockResolvedValueOnce({ success: true, data: entities[2] });

      const result = await repository.findAll({
        sort: (a, b) => a.name.localeCompare(b.name),
      });

      expect(result.map(e => e.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should apply limit and offset options', async () => {
      const entities = [
        { ...testEntity, id: '1' },
        { ...testEntity, id: '2' },
        { ...testEntity, id: '3' },
        { ...testEntity, id: '4' },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json', '3.json', '4.json'],
      });

      entities.forEach((entity) => {
        (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          success: true,
          data: entity,
        });
      });

      const result = await repository.findAll({
        offset: 1,
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
    });
  });

  describe('create', () => {
    it('should create entity successfully', async () => {
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.create(testEntity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testEntity);
      expect(mockAdapter.write).toHaveBeenCalledWith(
        'test-entities/entity-123.json',
        testEntity
      );
    });

    it('should return error on write failure', async () => {
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Write failed',
      });

      const result = await repository.create(testEntity);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Write failed');
    });
  });

  describe('update', () => {
    it('should update entity successfully', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: testEntity,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.update('entity-123', { name: 'Updated Name' });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated Name');
      expect(result.data?.id).toBe('entity-123'); // ID should not change
    });

    it('should return error when entity not found', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
      });

      const result = await repository.update('nonexistent', { name: 'New Name' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Item not found');
    });

    it('should preserve createdAt and id', async () => {
      const originalCreatedAt = '2024-01-01T00:00:00.000Z';
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { ...testEntity, createdAt: originalCreatedAt },
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.update('entity-123', {
        name: 'Updated',
        id: 'attempt-to-change-id' as any,
        createdAt: '2025-12-31T23:59:59.000Z' as any,
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('entity-123');
      expect(result.data?.createdAt).toBe(originalCreatedAt);
    });
  });

  describe('delete', () => {
    it('should delete entity successfully', async () => {
      (mockAdapter.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.delete('entity-123');

      expect(result.success).toBe(true);
      expect(mockAdapter.delete).toHaveBeenCalledWith('test-entities/entity-123.json');
    });
  });

  describe('exists', () => {
    it('should return true when entity exists', async () => {
      (mockAdapter.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await repository.exists('entity-123');

      expect(result).toBe(true);
    });

    it('should return false when entity does not exist', async () => {
      (mockAdapter.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await repository.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return total count', async () => {
      const entities = [
        { ...testEntity, id: '1' },
        { ...testEntity, id: '2' },
        { ...testEntity, id: '3' },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json', '3.json'],
      });

      entities.forEach((entity) => {
        (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          success: true,
          data: entity,
        });
      });

      const result = await repository.count();

      expect(result).toBe(3);
    });

    it('should return filtered count', async () => {
      const entities = [
        { ...testEntity, id: '1', value: 10 },
        { ...testEntity, id: '2', value: 50 },
        { ...testEntity, id: '3', value: 30 },
      ];

      (mockAdapter.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: ['1.json', '2.json', '3.json'],
      });

      entities.forEach((entity) => {
        (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          success: true,
          data: entity,
        });
      });

      const result = await repository.count((item) => item.value > 20);

      expect(result).toBe(2);
    });
  });

  describe('Caching', () => {
    it('should use cache when enabled', async () => {
      const cachedRepo = new TestRepository({ cacheEnabled: true, cacheTtl: 60000 });
      
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: testEntity,
      });

      // First call
      await cachedRepo.findById('entity-123');
      // Second call should use cache
      await cachedRepo.findById('entity-123');

      expect(mockAdapter.read).toHaveBeenCalledTimes(1);
    });

    it('should clear cache', async () => {
      const cachedRepo = new TestRepository({ cacheEnabled: true });
      
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: testEntity,
      });

      await cachedRepo.findById('entity-123');
      cachedRepo.clearCache();
      await cachedRepo.findById('entity-123');

      expect(mockAdapter.read).toHaveBeenCalledTimes(2);
    });
  });
});

describe('GroupedRepository', () => {
  let mockAdapter: StorageAdapter;
  let repository: TestGroupedRepository;

  const testEntity: TestEntity = {
    id: 'entity-123',
    name: 'Test Entity',
    value: 42,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    setDefaultStorageAdapter(mockAdapter);
    repository = new TestGroupedRepository({ cacheEnabled: false });
  });

  describe('findByGroupId', () => {
    it('should return items for a group', async () => {
      const groupedData = {
        'group-1': [testEntity, { ...testEntity, id: 'entity-456' }],
        'group-2': [{ ...testEntity, id: 'entity-789' }],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: groupedData,
      });

      const result = await repository.findByGroupId('group-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('entity-123');
    });

    it('should return empty array for non-existent group', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });

      const result = await repository.findByGroupId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('add', () => {
    it('should add item to existing group', async () => {
      const existingData = {
        'group-1': [testEntity],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: existingData,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const newEntity = { ...testEntity, id: 'new-entity' };
      const result = await repository.add('group-1', newEntity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(newEntity);
      
      const writeCall = (mockAdapter.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]['group-1']).toHaveLength(2);
    });

    it('should create new group if it does not exist', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.add('new-group', testEntity);

      expect(result.success).toBe(true);
      
      const writeCall = (mockAdapter.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]['new-group']).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update item in group', async () => {
      const existingData = {
        'group-1': [testEntity],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: existingData,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.update('group-1', 'entity-123', { name: 'Updated' });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated');
    });

    it('should return error for non-existent group', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });

      const result = await repository.update('nonexistent', 'entity-123', { name: 'Updated' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Group not found');
    });

    it('should return error for non-existent item', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { 'group-1': [testEntity] },
      });

      const result = await repository.update('group-1', 'nonexistent', { name: 'Updated' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Item not found');
    });
  });

  describe('delete', () => {
    it('should delete item from group', async () => {
      const existingData = {
        'group-1': [testEntity, { ...testEntity, id: 'entity-456' }],
      };

      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: existingData,
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.delete('group-1', 'entity-123');

      expect(result.success).toBe(true);
      
      const writeCall = (mockAdapter.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]['group-1']).toHaveLength(1);
      expect(writeCall[1]['group-1'][0].id).toBe('entity-456');
    });

    it('should succeed even if group does not exist', async () => {
      (mockAdapter.read as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {},
      });
      (mockAdapter.write as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await repository.delete('nonexistent', 'entity-123');

      expect(result.success).toBe(true);
    });
  });
});
