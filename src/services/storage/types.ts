/** Shared types for storage operations. */

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

