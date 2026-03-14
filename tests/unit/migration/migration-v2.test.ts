/**
 * Migration V2 Service Tests
 * Tests for the V2 migration from old storage to Meeting-centric architecture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(new Uint8Array()),
  exists: vi.fn().mockResolvedValue(false),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readDir: vi.fn().mockResolvedValue([]),
  copyFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/app/data/'),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

// Import after mocks
import { readFile, exists, readDir, writeFile, mkdir } from '@tauri-apps/plugin-fs';

describe('MigrationV2Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('needsMigration', () => {
    it('should return false when no legacy data exists', async () => {
      vi.mocked(exists).mockResolvedValue(false);
      
      // Dynamically import to get fresh instance
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const result = await migrationV2Service.needsMigration();
      expect(result).toBe(false);
    });

    it('should return true when history.json exists', async () => {
      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('history.json')) return true;
        if (path.includes('migration_status.json')) return false;
        return false;
      });
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const result = await migrationV2Service.needsMigration();
      expect(result).toBe(true);
    });

    it('should return false when already migrated', async () => {
      const migrationStatus = {
        version: 2,
        lastMigration: new Date().toISOString(),
        status: 'completed',
      };
      
      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('migration_status.json')) return true;
        return false;
      });
      
      vi.mocked(readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(migrationStatus))
      );
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const result = await migrationV2Service.needsMigration();
      expect(result).toBe(false);
    });
  });

  describe('getMigrationStatus', () => {
    it('should return null when status file does not exist', async () => {
      vi.mocked(exists).mockResolvedValue(false);
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const status = await migrationV2Service.getMigrationStatus();
      expect(status).toBeNull();
    });

    it('should return status when file exists', async () => {
      const expectedStatus = {
        version: 2,
        lastMigration: '2025-01-25T00:00:00.000Z',
        status: 'completed',
        details: 'Migrated 10 meetings',
      };
      
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(expectedStatus))
      );
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const status = await migrationV2Service.getMigrationStatus();
      expect(status).toEqual(expectedStatus);
    });
  });

  describe('migrate', () => {
    it('should skip migration when not needed', async () => {
      // No history.json, no recordings, already has status
      const migrationStatus = {
        version: 2,
        lastMigration: new Date().toISOString(),
        status: 'completed',
      };
      
      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('migration_status.json')) return true;
        return false;
      });
      
      vi.mocked(readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(migrationStatus))
      );
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const result = await migrationV2Service.migrate();
      
      expect(result.success).toBe(true);
      expect(result.skippedCount).toBe(1);
      expect(result.migratedCount).toBe(0);
    });

    it('should migrate history entries to meetings', async () => {
      const historyEntries = [
        {
          id: 'entry-1',
          type: 'recording',
          title: 'Test Recording 1',
          recordingId: 'rec-1',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          timestamp: 1704067200000,
          version: 1,
        },
        {
          id: 'entry-2',
          type: 'recording',
          title: 'Test Recording 2',
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          timestamp: 1704153600000,
          version: 1,
        },
      ];

      // Track state to simulate directory creation
      let meetingsCreated = false;

      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('migration_status.json')) return false;
        if (path.includes('history.json')) return true;
        if (path.includes('backups')) return false;
        // After mkdir is called, meetings dir exists
        if (path.includes('meetings')) return meetingsCreated;
        return false;
      });

      // Mock mkdir to update state
      vi.mocked(mkdir).mockImplementation(async (path: string) => {
        if (path.includes('meetings')) {
          meetingsCreated = true;
        }
      });

      vi.mocked(readFile).mockImplementation(async (path: string) => {
        if (path.includes('history.json')) {
          return new TextEncoder().encode(JSON.stringify(historyEntries));
        }
        return new Uint8Array();
      });

      // Mock readDir for verification step - return the created meetings
      vi.mocked(readDir).mockImplementation(async (path: string) => {
        if (path.includes('meetings') && meetingsCreated) {
          return [
            { name: 'entry-1.json', isDirectory: false, isFile: true, isSymlink: false },
            { name: 'entry-2.json', isDirectory: false, isFile: true, isSymlink: false },
          ];
        }
        return [];
      });

      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');

      const result = await migrationV2Service.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(2);
      expect(result.errors.length).toBe(0);
      expect(result.backupPath).toBeDefined();
      
      // Verify meetings were saved
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no meetings exist', async () => {
      vi.mocked(exists).mockResolvedValue(false);
      
      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');
      
      const stats = await migrationV2Service.getStats();
      
      expect(stats.totalMeetings).toBe(0);
      expect(stats.withTranscript).toBe(0);
      expect(stats.withSummary).toBe(0);
    });

    it('should return correct stats for meetings', async () => {
      const meetings = [
        { id: '1', transcript: 'text', summary: 'summary' },
        { id: '2', transcript: 'text', summary: null },
        { id: '3', transcript: null, summary: null },
      ];

      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('meetings')) return true;
        return false;
      });

      vi.mocked(readDir).mockResolvedValue([
        { name: '1.json', isDirectory: false, isFile: true, isSymlink: false },
        { name: '2.json', isDirectory: false, isFile: true, isSymlink: false },
        { name: '3.json', isDirectory: false, isFile: true, isSymlink: false },
      ]);

      let callIndex = 0;
      vi.mocked(readFile).mockImplementation(async () => {
        const meeting = meetings[callIndex++];
        return new TextEncoder().encode(JSON.stringify(meeting));
      });

      const { migrationV2Service } = await import('../../../services/migration/migration-v2.service');

      const stats = await migrationV2Service.getStats();

      expect(stats.totalMeetings).toBe(3);
      expect(stats.withTranscript).toBe(2);
      expect(stats.withSummary).toBe(1);
    });
  });
});

describe('Migration Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runMigrations', () => {
    it('should run both V1 and V2 migrations', async () => {
      // Mock V1 as already migrated
      vi.mocked(exists).mockImplementation(async (path: string) => {
        if (path.includes('migration_status.json')) return true;
        return false;
      });

      vi.mocked(readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({
          version: 2,
          status: 'completed',
          lastMigration: new Date().toISOString(),
        }))
      );

      const { runMigrations } = await import('../../../services/migration');

      const result = await runMigrations();

      expect(result.v1).toBeDefined();
      expect(result.v2).toBeDefined();
    });
  });

  describe('getMigrationStatus', () => {
    it('should return combined status', async () => {
      vi.mocked(exists).mockResolvedValue(false);

      const { getMigrationStatus } = await import('../../../services/migration');

      const status = await getMigrationStatus();

      expect(status).toHaveProperty('v1Migrated');
      expect(status).toHaveProperty('v2Status');
    });
  });
});
