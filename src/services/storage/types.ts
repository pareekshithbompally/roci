/** Shared types for storage operations. */

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  createdAt: string;
  expiresAt: string;
  size: number; // bytes
}

export interface StorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

