/** Shared types for storage operations. */

import type { AudioCaptureSource } from '@config/audio.config';
import type { ModelProvider } from '@shared/types/modelProviders';

export interface BaseMetadata {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  version: number; // Schema version
}

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

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  autoSave: boolean;
  recordingQuality: 'low' | 'medium' | 'high';
  aiModel: string;
  autoTranscribe: boolean;
  geminiApiKey?: string;
  
  // New fields for model providers
  providers?: ModelProvider[]; // Array of ModelProvider objects
  selectedProviderName?: string | null;
  
  [key: string]: unknown; // Allow arbitrary settings for migration compatibility
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  createdAt: string;
  expiresAt: string;
  size: number; // bytes
}

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

export interface StorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DirectoryInfo {
  path: string;
  exists: boolean;
  size: number; // bytes
  fileCount: number;
}

export interface FileOperationOptions {
  createDir?: boolean; // Create directory if not exists
  overwrite?: boolean; // Overwrite existing file
  backup?: boolean; // Create backup before overwriting
  atomic?: boolean; // Use atomic write
}
