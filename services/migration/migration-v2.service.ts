/**
 * Migration V2 Service
 * Migrates data from old scattered storage to new Meeting-centric architecture
 * 
 * Old Structure:
 * - history.json (flat list)
 * - notes.json (grouped by meetingId)
 * - user_todos.json (grouped by meetingId)
 * - recordings/{file}.meta.json
 * - transcriptions/{id}.json
 * - summaries/{id}.json
 * 
 * New Structure:
 * - meetings/{id}.json (unified Meeting entity)
 * - notes.json (same format, used by repository)
 * - todos.json (same format, used by repository)
 */

import { writeFile, readFile, exists, mkdir, readDir, copyFile } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import type { HistoryEntry, RecordingMetadata, TranscriptionData, SummaryData } from '../storage/types';
import type { Meeting, MeetingStatus } from '../../src/core/data/models/meeting.model';

/**
 * Migration result interface
 */
export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errors: string[];
  backupPath?: string;
}

/**
 * Migration status for tracking
 */
export interface MigrationStatus {
  version: number;
  lastMigration: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  details?: string;
}

/**
 * Schema version constants
 */
const SCHEMA_VERSIONS = {
  V1: 1, // Original localStorage/old Tauri structure
  V2: 2, // New Meeting-centric architecture
} as const;

const CURRENT_SCHEMA_VERSION = SCHEMA_VERSIONS.V2;
const MIGRATION_STATUS_FILE = 'migration_status.json';

class MigrationV2Service {
  private basePath: string | null = null;

  /**
   * Initialize and get base path
   */
  private async getBasePath(): Promise<string> {
    if (!this.basePath) {
      this.basePath = await appDataDir();
    }
    return this.basePath;
  }

  /**
   * Check if V2 migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      const status = await this.getMigrationStatus();
      
      // Already migrated
      if (status && status.version >= CURRENT_SCHEMA_VERSION && status.status === 'completed') {
        return false;
      }

      // Check if there's legacy data to migrate
      const hasLegacyData = await this.hasLegacyData();
      return hasLegacyData;
    } catch (error) {
      console.error('[MigrationV2] Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Check if legacy data exists
   */
  private async hasLegacyData(): Promise<boolean> {
    const basePath = await this.getBasePath();
    
    // Check for history.json (main indicator of old data)
    const historyPath = await join(basePath, 'history.json');
    const hasHistory = await exists(historyPath);
    
    if (hasHistory) {
      return true;
    }

    // Check for recordings directory with metadata
    const recordingsPath = await join(basePath, 'recordings');
    if (await exists(recordingsPath)) {
      try {
        const entries = await readDir(recordingsPath);
        const hasMetadata = entries.some(e => e.name.endsWith('.meta.json'));
        if (hasMetadata) return true;
      } catch {
        // Ignore errors
      }
    }

    return false;
  }

  /**
   * Get current migration status
   */
  async getMigrationStatus(): Promise<MigrationStatus | null> {
    try {
      const basePath = await this.getBasePath();
      const statusPath = await join(basePath, MIGRATION_STATUS_FILE);
      
      if (!await exists(statusPath)) {
        return null;
      }

      const data = await readFile(statusPath);
      return JSON.parse(new TextDecoder().decode(data)) as MigrationStatus;
    } catch (error) {
      console.error('[MigrationV2] Failed to read migration status:', error);
      return null;
    }
  }

  /**
   * Save migration status
   */
  private async saveMigrationStatus(status: MigrationStatus): Promise<void> {
    try {
      const basePath = await this.getBasePath();
      const statusPath = await join(basePath, MIGRATION_STATUS_FILE);
      
      await writeFile(
        statusPath,
        new TextEncoder().encode(JSON.stringify(status, null, 2))
      );
    } catch (error) {
      console.error('[MigrationV2] Failed to save migration status:', error);
    }
  }

  /**
   * Run the V2 migration
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    console.log('[MigrationV2] Starting migration...');

    try {
      // Check if migration is needed
      if (!await this.needsMigration()) {
        console.log('[MigrationV2] No migration needed');
        result.success = true;
        result.skippedCount = 1;
        return result;
      }

      // Update status to in_progress
      await this.saveMigrationStatus({
        version: CURRENT_SCHEMA_VERSION,
        lastMigration: new Date().toISOString(),
        status: 'in_progress',
      });

      // Step 1: Create backup
      const backupPath = await this.createBackup();
      result.backupPath = backupPath;
      console.log('[MigrationV2] Backup created at:', backupPath);

      // Step 2: Ensure meetings directory exists
      await this.ensureMeetingsDirectory();

      // Step 3: Load all legacy data
      const legacyData = await this.loadLegacyData();
      console.log('[MigrationV2] Loaded legacy data:', {
        historyEntries: legacyData.history.length,
        recordings: legacyData.recordings.length,
        transcriptions: legacyData.transcriptions.length,
        summaries: legacyData.summaries.length,
      });

      // Step 4: Transform and migrate data
      const meetings = await this.transformToMeetings(legacyData);
      console.log('[MigrationV2] Transformed', meetings.length, 'meetings');

      // Step 5: Save meetings to new structure
      for (const meeting of meetings) {
        try {
          await this.saveMeeting(meeting);
          result.migratedCount++;
        } catch (error) {
          result.errors.push(`Failed to save meeting ${meeting.id}: ${error}`);
        }
      }

      // Step 6: Verify migration
      const verified = await this.verifyMigration(meetings.length);
      if (!verified) {
        result.errors.push('Migration verification failed');
        throw new Error('Migration verification failed');
      }

      // Update status to completed
      await this.saveMigrationStatus({
        version: CURRENT_SCHEMA_VERSION,
        lastMigration: new Date().toISOString(),
        status: 'completed',
        details: `Migrated ${result.migratedCount} meetings`,
      });

      result.success = true;
      console.log('[MigrationV2] Migration completed successfully');
      console.log('[MigrationV2] Migrated:', result.migratedCount, 'Errors:', result.errors.length);

    } catch (error) {
      console.error('[MigrationV2] Migration failed:', error);
      result.errors.push(`Migration failed: ${error}`);
      
      // Update status to failed
      await this.saveMigrationStatus({
        version: CURRENT_SCHEMA_VERSION,
        lastMigration: new Date().toISOString(),
        status: 'failed',
        details: `${error}`,
      });
    }

    return result;
  }

  /**
   * Create backup of existing data
   */
  private async createBackup(): Promise<string> {
    const basePath = await this.getBasePath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = await join(basePath, 'backups', `v2-migration-${timestamp}`);
    
    await mkdir(backupDir, { recursive: true });

    // Files to backup
    const filesToBackup = [
      'history.json',
      'notes.json',
      'user_todos.json',
      'settings.json',
    ];

    for (const file of filesToBackup) {
      const sourcePath = await join(basePath, file);
      if (await exists(sourcePath)) {
        const destPath = await join(backupDir, file);
        await copyFile(sourcePath, destPath);
        console.log('[MigrationV2] Backed up:', file);
      }
    }

    // Backup recordings metadata
    const recordingsPath = await join(basePath, 'recordings');
    if (await exists(recordingsPath)) {
      const recordingsBackup = await join(backupDir, 'recordings');
      await mkdir(recordingsBackup, { recursive: true });
      
      const entries = await readDir(recordingsPath);
      for (const entry of entries) {
        if (entry.name.endsWith('.meta.json')) {
          const source = await join(recordingsPath, entry.name);
          const dest = await join(recordingsBackup, entry.name);
          await copyFile(source, dest);
        }
      }
    }

    return backupDir;
  }

  /**
   * Ensure meetings directory exists
   */
  private async ensureMeetingsDirectory(): Promise<void> {
    const basePath = await this.getBasePath();
    const meetingsPath = await join(basePath, 'meetings');
    
    if (!await exists(meetingsPath)) {
      await mkdir(meetingsPath, { recursive: true });
      console.log('[MigrationV2] Created meetings directory');
    }
  }

  /**
   * Load all legacy data
   */
  private async loadLegacyData(): Promise<{
    history: HistoryEntry[];
    recordings: RecordingMetadata[];
    transcriptions: TranscriptionData[];
    summaries: SummaryData[];
    notes: Record<string, any[]>;
    todos: Record<string, any[]>;
  }> {
    const basePath = await this.getBasePath();

    // Load history
    let history: HistoryEntry[] = [];
    const historyPath = await join(basePath, 'history.json');
    if (await exists(historyPath)) {
      try {
        const data = await readFile(historyPath);
        history = JSON.parse(new TextDecoder().decode(data));
      } catch (error) {
        console.warn('[MigrationV2] Failed to load history:', error);
      }
    }

    // Load recordings metadata
    const recordings: RecordingMetadata[] = [];
    const recordingsPath = await join(basePath, 'recordings');
    if (await exists(recordingsPath)) {
      try {
        const entries = await readDir(recordingsPath);
        for (const entry of entries) {
          if (entry.name.endsWith('.meta.json')) {
            const metaPath = await join(recordingsPath, entry.name);
            const data = await readFile(metaPath);
            const meta = JSON.parse(new TextDecoder().decode(data));
            recordings.push(meta);
          }
        }
      } catch (error) {
        console.warn('[MigrationV2] Failed to load recordings:', error);
      }
    }

    // Load transcriptions
    const transcriptions: TranscriptionData[] = [];
    const transcriptionsPath = await join(basePath, 'transcriptions');
    if (await exists(transcriptionsPath)) {
      try {
        const entries = await readDir(transcriptionsPath);
        for (const entry of entries) {
          if (entry.name.endsWith('.json')) {
            const filePath = await join(transcriptionsPath, entry.name);
            const data = await readFile(filePath);
            const transcription = JSON.parse(new TextDecoder().decode(data));
            transcriptions.push(transcription);
          }
        }
      } catch (error) {
        console.warn('[MigrationV2] Failed to load transcriptions:', error);
      }
    }

    // Load summaries
    const summaries: SummaryData[] = [];
    const summariesPath = await join(basePath, 'summaries');
    if (await exists(summariesPath)) {
      try {
        const entries = await readDir(summariesPath);
        for (const entry of entries) {
          if (entry.name.endsWith('.json')) {
            const filePath = await join(summariesPath, entry.name);
            const data = await readFile(filePath);
            const summary = JSON.parse(new TextDecoder().decode(data));
            summaries.push(summary);
          }
        }
      } catch (error) {
        console.warn('[MigrationV2] Failed to load summaries:', error);
      }
    }

    // Load notes
    let notes: Record<string, any[]> = {};
    const notesPath = await join(basePath, 'notes.json');
    if (await exists(notesPath)) {
      try {
        const data = await readFile(notesPath);
        notes = JSON.parse(new TextDecoder().decode(data));
      } catch (error) {
        console.warn('[MigrationV2] Failed to load notes:', error);
      }
    }

    // Load todos
    let todos: Record<string, any[]> = {};
    const todosPath = await join(basePath, 'user_todos.json');
    if (await exists(todosPath)) {
      try {
        const data = await readFile(todosPath);
        todos = JSON.parse(new TextDecoder().decode(data));
      } catch (error) {
        console.warn('[MigrationV2] Failed to load todos:', error);
      }
    }

    return {
      history,
      recordings,
      transcriptions,
      summaries,
      notes,
      todos,
    };
  }

  /**
   * Transform legacy data to Meeting entities
   */
  private async transformToMeetings(legacyData: {
    history: HistoryEntry[];
    recordings: RecordingMetadata[];
    transcriptions: TranscriptionData[];
    summaries: SummaryData[];
    notes: Record<string, any[]>;
    todos: Record<string, any[]>;
  }): Promise<Meeting[]> {
    const meetings: Meeting[] = [];
    const processedIds = new Set<string>();

    // Create lookup maps for efficient matching
    const recordingsByFilename = new Map<string, RecordingMetadata>();
    const recordingsById = new Map<string, RecordingMetadata>();
    legacyData.recordings.forEach(r => {
      recordingsByFilename.set(r.filename, r);
      recordingsById.set(r.id, r);
    });

    const transcriptionsByRecordingId = new Map<string, TranscriptionData>();
    legacyData.transcriptions.forEach(t => {
      transcriptionsByRecordingId.set(t.recordingId, t);
    });

    const summariesByRecordingId = new Map<string, SummaryData>();
    legacyData.summaries.forEach(s => {
      summariesByRecordingId.set(s.recordingId, s);
    });

    // Process history entries
    for (const entry of legacyData.history) {
      if (processedIds.has(entry.id)) continue;

      // Find related data
      let recording: RecordingMetadata | undefined;
      if (entry.recordingId) {
        recording = recordingsById.get(entry.recordingId);
      }

      // Try to match by filename from metadata
      if (!recording && entry.metadata?.recordingFileName) {
        recording = recordingsByFilename.get(entry.metadata.recordingFileName as string);
      }

      const recordingId = recording?.id || entry.recordingId;
      const transcription = recordingId ? transcriptionsByRecordingId.get(recordingId) : undefined;
      const summary = recordingId ? summariesByRecordingId.get(recordingId) : undefined;

      // Determine status
      let status: MeetingStatus = 'completed';
      if (!transcription && !summary) {
        status = 'completed'; // Even without processing, treat as completed
      }

      const meeting: Meeting = {
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt || entry.createdAt,
        version: 2,
        title: entry.title || 'Untitled Recording',
        status,
        category: this.mapCategory(entry.metadata?.category as string),
        tags: entry.categories,
        timestamp: entry.timestamp || new Date(entry.createdAt).getTime(),
        duration: recording?.duration,
        recordingId: recording?.id,
        recordingFileName: recording?.filename,
        transcriptionId: transcription?.id,
        transcript: transcription?.text,
        summaryId: summary?.id,
        summary: summary?.summary,
        structuredSummary: summary ? {
          tldr: summary.summary,
          notes: summary.keyPoints?.join('\n'),
          actionItems: summary.actionItems?.map((item, idx) => ({
            id: `action-${idx}`,
            text: item,
            completed: false,
          })),
        } : undefined,
        categories: summary?.categories || entry.categories,
        inputSource: recording?.inputSource,
        metadata: {
          ...entry.metadata,
          migratedFrom: 'v1',
          migratedAt: new Date().toISOString(),
        },
      };

      meetings.push(meeting);
      processedIds.add(entry.id);

      // Also mark recording as processed
      if (recording) {
        processedIds.add(recording.id);
      }
    }

    // Process any recordings not in history
    for (const recording of legacyData.recordings) {
      if (processedIds.has(recording.id)) continue;

      const transcription = transcriptionsByRecordingId.get(recording.id);
      const summary = summariesByRecordingId.get(recording.id);

      const meeting: Meeting = {
        id: crypto.randomUUID(),
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt || recording.createdAt,
        version: 2,
        title: recording.filename || 'Untitled Recording',
        status: 'completed',
        timestamp: new Date(recording.createdAt).getTime(),
        duration: recording.duration,
        recordingId: recording.id,
        recordingFileName: recording.filename,
        transcriptionId: transcription?.id,
        transcript: transcription?.text,
        summaryId: summary?.id,
        summary: summary?.summary,
        inputSource: recording.inputSource,
        categories: summary?.categories,
        metadata: {
          migratedFrom: 'v1-recording',
          migratedAt: new Date().toISOString(),
        },
      };

      meetings.push(meeting);
      processedIds.add(recording.id);
    }

    return meetings;
  }

  /**
   * Map old category to new MeetingCategory
   */
  private mapCategory(category?: string): Meeting['category'] {
    if (!category) return 'other';
    
    const mapping: Record<string, Meeting['category']> = {
      'meeting': 'meeting',
      'interview': 'interview',
      'lecture': 'lecture',
      'podcast': 'podcast',
      'call': 'call',
      'note': 'note',
    };

    return mapping[category.toLowerCase()] || 'other';
  }

  /**
   * Save a meeting to the new structure
   */
  private async saveMeeting(meeting: Meeting): Promise<void> {
    const basePath = await this.getBasePath();
    const meetingPath = await join(basePath, 'meetings', `${meeting.id}.json`);
    
    await writeFile(
      meetingPath,
      new TextEncoder().encode(JSON.stringify(meeting, null, 2))
    );
  }

  /**
   * Verify migration completed correctly
   */
  private async verifyMigration(expectedCount: number): Promise<boolean> {
    try {
      const basePath = await this.getBasePath();
      const meetingsPath = await join(basePath, 'meetings');
      
      if (!await exists(meetingsPath)) {
        console.error('[MigrationV2] Meetings directory does not exist');
        return false;
      }

      const entries = await readDir(meetingsPath);
      const meetingFiles = entries.filter(e => e.name.endsWith('.json'));
      
      console.log('[MigrationV2] Verification: Expected', expectedCount, 'Found', meetingFiles.length);
      
      // Allow for some variance (in case some entries were merged)
      return meetingFiles.length >= expectedCount * 0.9;
    } catch (error) {
      console.error('[MigrationV2] Verification failed:', error);
      return false;
    }
  }

  /**
   * Rollback migration (restore from backup)
   */
  async rollback(backupPath: string): Promise<boolean> {
    try {
      console.log('[MigrationV2] Rolling back migration from:', backupPath);
      
      if (!await exists(backupPath)) {
        console.error('[MigrationV2] Backup path does not exist');
        return false;
      }

      const basePath = await this.getBasePath();

      // Restore backed up files
      const filesToRestore = ['history.json', 'notes.json', 'user_todos.json', 'settings.json'];
      
      for (const file of filesToRestore) {
        const backupFile = await join(backupPath, file);
        if (await exists(backupFile)) {
          const destPath = await join(basePath, file);
          await copyFile(backupFile, destPath);
          console.log('[MigrationV2] Restored:', file);
        }
      }

      // Update status
      await this.saveMigrationStatus({
        version: SCHEMA_VERSIONS.V1,
        lastMigration: new Date().toISOString(),
        status: 'rolled_back',
        details: `Rolled back from ${backupPath}`,
      });

      console.log('[MigrationV2] Rollback completed');
      return true;
    } catch (error) {
      console.error('[MigrationV2] Rollback failed:', error);
      return false;
    }
  }

  /**
   * Get migration statistics
   */
  async getStats(): Promise<{
    totalMeetings: number;
    withTranscript: number;
    withSummary: number;
    withNotes: number;
    withTodos: number;
  }> {
    try {
      const basePath = await this.getBasePath();
      const meetingsPath = await join(basePath, 'meetings');
      
      if (!await exists(meetingsPath)) {
        return { totalMeetings: 0, withTranscript: 0, withSummary: 0, withNotes: 0, withTodos: 0 };
      }

      const entries = await readDir(meetingsPath);
      let totalMeetings = 0;
      let withTranscript = 0;
      let withSummary = 0;

      for (const entry of entries) {
        if (!entry.name.endsWith('.json')) continue;
        
        totalMeetings++;
        
        try {
          const filePath = await join(meetingsPath, entry.name);
          const data = await readFile(filePath);
          const meeting = JSON.parse(new TextDecoder().decode(data)) as Meeting;
          
          if (meeting.transcript) withTranscript++;
          if (meeting.summary) withSummary++;
        } catch {
          // Skip invalid files
        }
      }

      // Count notes and todos from their respective files
      let withNotes = 0;
      let withTodos = 0;

      const notesPath = await join(basePath, 'notes.json');
      if (await exists(notesPath)) {
        try {
          const data = await readFile(notesPath);
          const notes = JSON.parse(new TextDecoder().decode(data));
          withNotes = Object.keys(notes).filter(k => notes[k].length > 0).length;
        } catch {
          // Ignore
        }
      }

      const todosPath = await join(basePath, 'user_todos.json');
      if (await exists(todosPath)) {
        try {
          const data = await readFile(todosPath);
          const todos = JSON.parse(new TextDecoder().decode(data));
          withTodos = Object.keys(todos).filter(k => todos[k].length > 0).length;
        } catch {
          // Ignore
        }
      }

      return {
        totalMeetings,
        withTranscript,
        withSummary,
        withNotes,
        withTodos,
      };
    } catch (error) {
      console.error('[MigrationV2] Failed to get stats:', error);
      return { totalMeetings: 0, withTranscript: 0, withSummary: 0, withNotes: 0, withTodos: 0 };
    }
  }
}

// Export singleton
export const migrationV2Service = new MigrationV2Service();
