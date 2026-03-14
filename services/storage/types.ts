/**
 * Storage Service Types
 * Shared interfaces and types for all storage operations
 */

import type { AudioCaptureSource } from '../../src/config/audio.config';

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
 * Transcription data
 */
export interface TranscriptionData extends BaseMetadata {
  recordingId: string;
  text: string;
  language?: string;
  confidence?: number;
  processingTime?: number; // milliseconds
  model?: string;
}

/**
 * Summary data
 */
export interface SummaryData extends BaseMetadata {
  recordingId: string;
  transcriptionId: string;
  summary: string;
  categories?: string[];
  keyPoints: string[];
  actionItems?: string[];
  model?: string;
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: import('../../types').ChatPart[];
  timestamp: string; // ISO timestamp
  provider?: string;
  model?: string;
  suggestions?: string[]; // Follow-up suggestions for AI responses
  tokenCount?: number;
  tokensPerSecond?: number;
  toolActivity?: import('../../types').ChatMessage['toolActivity'];
  webCitations?: import('../../types').WebCitation[];
  inlineCitations?: import('../../types').InlineCitationSpan[];
}

/**
 * Chat thread
 */
export interface ChatThread extends BaseMetadata {
  title?: string;
  messages: ChatMessage[];
  recordingId?: string;
  transcriptionId?: string;
  model?: string;
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
 * History entry
 */
export interface HistoryEntry extends BaseMetadata {
  type: 'recording' | 'transcription' | 'chat' | 'summary';
  title: string;
  description?: string;
  recordingId?: string;
  transcriptionId?: string;
  summaryId?: string;
  timestamp?: number;
  categories?: string[];
  metadata?: Record<string, any>;
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
