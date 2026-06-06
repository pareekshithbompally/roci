/**
 * Storage Service Types
 * Shared interfaces and types for all storage operations
 */

import type { AudioCaptureSource } from '@config/audio.config';

/**
 * Base metadata for all stored items
 */
export interface BaseMetadata {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  version: number; // Schema version
}

/**
 * Recording metadata
 */
export interface RecordingMetadata extends BaseMetadata {
  filename: string;
  duration: number; // seconds
  format: string; // e.g., 'webm', 'wav'
  size: number; // bytes
  deviceLabel?: string;
  inputSource?: AudioCaptureSource;
  transcriptionId?: string;
  summaryId?: string;
}

/**
 * App settings
 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  autoSave: boolean;
  notificationsEnabled: boolean;
  recordingQuality: 'low' | 'medium' | 'high';
  aiModel: string;
  autoTranscribe: boolean;
  geminiApiKey?: string;
  audioQualityPreset?: 'voice' | 'podcast' | 'music' | 'professional';
  
  // New fields for model providers
  providers?: any[]; // Array of ModelProvider objects
  selectedProviderName?: string | null;
  
  [key: string]: any; // Allow arbitrary settings for migration compatibility
}

/**
 * Cache entry
 */
export interface CacheEntry<T = any> {
  key: string;
  data: T;
  createdAt: string;
  expiresAt: string;
  size: number; // bytes
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalSize: number; // bytes
  entryCount: number;
  audioCache: {
    size: number;
    count: number;
  };
  apiCache: {
    size: number;
    count: number;
  };
}

/**
 * Storage operation result
 */
export interface StorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Directory info
 */
export interface DirectoryInfo {
  path: string;
  exists: boolean;
  size: number; // bytes
  fileCount: number;
}

/**
 * File operation options
 */
export interface FileOperationOptions {
  createDir?: boolean; // Create directory if not exists
  overwrite?: boolean; // Overwrite existing file
  backup?: boolean; // Create backup before overwriting
  atomic?: boolean; // Use atomic write
}
