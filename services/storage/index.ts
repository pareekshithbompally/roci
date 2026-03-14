/**
 * Storage Services - Central Export
 * All storage-related services for Kasset.ai
 */

import { pathsService } from './paths.service';
import { cacheService } from './cache.service';

// Services
export { pathsService } from './paths.service';
export { recordingsService } from './recordings.service';
export { transcriptionsService } from './transcriptions.service';
export { chatsService } from './chats.service';
export { summariesService } from './summaries.service';
export { cacheService } from './cache.service';
export { settingsService } from './settings.service';
export { historyService } from './history.service';
export { notesService } from './notes.service';
export { todosService } from './todos.service';
export { encryptionService } from './encryption.service';

// Types
export type {
  BaseMetadata,
  RecordingMetadata,
  TranscriptionData,
  SummaryData,
  ChatThread,
  ChatMessage,
  AppSettings,
  HistoryEntry,
  CacheEntry,
  CacheStats,
  StorageResult,
  DirectoryInfo,
  FileOperationOptions,
} from './types';

export type { StoredNote } from './notes.service';
export type { StoredTodo } from './todos.service';

/**
 * Initialize all storage services
 * Call this on app startup
 */
export async function initializeStorage(): Promise<void> {
  console.log('[Storage] ========== Initializing storage system ==========');
  
  // Initialize paths and create directory structure
  const result = await pathsService.initialize();
  
  if (!result.success) {
    console.error('[Storage] ❌ FAILED to initialize storage:', result.error);
    throw new Error('Storage initialization failed: ' + result.error);
  }
  
  console.log('[Storage] ✓ Storage initialized at:', result.data);
  
  // Clean up expired cache on startup
  const cacheCleanup = await cacheService.clearExpired();
  if (cacheCleanup.success && cacheCleanup.data) {
    console.log('[Storage] ✓ Cleaned up', cacheCleanup.data, 'expired cache entries');
  }
  
  console.log('[Storage] ========== Storage initialization complete ==========');
}
