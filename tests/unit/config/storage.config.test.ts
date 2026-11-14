import { describe, it, expect } from 'vitest';
import {
  generateRecordingFilename,
  getRecordingIdFromFilename,
  generateCacheFilename,
  StorageConfig,
} from '@config/storage.config';

// ── generateRecordingFilename ───────────────────────────────────

describe('generateRecordingFilename', () => {
  it('starts with the rec_ prefix', () => {
    const name = generateRecordingFilename();
    expect(name).toMatch(/^rec_/);
  });

  it('contains a timestamp segment', () => {
    const before = Date.now();
    const name = generateRecordingFilename();
    const after = Date.now();

    const parts = name.split('_');
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('contains a UUID segment (8 hex chars)', () => {
    const name = generateRecordingFilename();
    // Format: rec_{timestamp}_{uuid}.wav
    const uuidPart = name.split('_')[2].replace(/\.\w+$/, '');
    expect(uuidPart).toMatch(/^[0-9a-f]{8}$/);
  });

  it('uses .wav as default extension', () => {
    const name = generateRecordingFilename();
    expect(name).toMatch(/\.wav$/);
  });

  it('uses custom extension when provided', () => {
    const name = generateRecordingFilename('.mp3');
    expect(name).toMatch(/\.mp3$/);
    expect(name).not.toMatch(/\.wav/);
  });

  it('generates unique filenames on successive calls', () => {
    const a = generateRecordingFilename();
    const b = generateRecordingFilename();
    expect(a).not.toBe(b);
  });
});

// ── getRecordingIdFromFilename ──────────────────────────────────

describe('getRecordingIdFromFilename', () => {
  it('strips file extension', () => {
    expect(getRecordingIdFromFilename('rec_123_abc.wav')).toBe('rec_123_abc');
  });

  it('strips only the last extension', () => {
    expect(getRecordingIdFromFilename('file.backup.wav')).toBe('file.backup');
  });

  it('returns filename as-is when no extension', () => {
    expect(getRecordingIdFromFilename('noextension')).toBe('noextension');
  });

  it('returns filename as-is for dotfiles (dot at index 0)', () => {
    expect(getRecordingIdFromFilename('.hidden')).toBe('.hidden');
  });

  it('handles empty string', () => {
    expect(getRecordingIdFromFilename('')).toBe('');
  });

  it('handles filename with multiple dots', () => {
    expect(getRecordingIdFromFilename('a.b.c.wav')).toBe('a.b.c');
  });
});

// ── generateCacheFilename ───────────────────────────────────────

describe('generateCacheFilename', () => {
  it('is deterministic for the same key', () => {
    const a = generateCacheFilename('my-key');
    const b = generateCacheFilename('my-key');
    expect(a).toBe(b);
  });

  it('produces different names for different keys', () => {
    const a = generateCacheFilename('key-alpha');
    const b = generateCacheFilename('key-beta');
    expect(a).not.toBe(b);
  });

  it('starts with temp_ prefix', () => {
    const name = generateCacheFilename('test');
    expect(name).toMatch(/^temp_/);
  });

  it('uses default .cache extension', () => {
    const name = generateCacheFilename('test');
    expect(name).toMatch(/\.cache$/);
  });

  it('uses custom extension', () => {
    const name = generateCacheFilename('test', '.json');
    expect(name).toMatch(/\.json$/);
    expect(name).not.toMatch(/\.cache/);
  });

  it('handles empty key', () => {
    const name = generateCacheFilename('');
    expect(name).toMatch(/^temp_/);
    expect(name).toMatch(/\.cache$/);
  });

  it('handles keys with special characters', () => {
    const name = generateCacheFilename('special!@#$%^&*()');
    expect(name).toMatch(/^temp_/);
  });
});

// ── StorageConfig structure ─────────────────────────────────────

describe('StorageConfig', () => {
  it('has expected directory keys', () => {
    expect(StorageConfig.directories).toHaveProperty('recordings');
    expect(StorageConfig.directories).toHaveProperty('cache');
    expect(StorageConfig.directories).toHaveProperty('cacheAudio');
    expect(StorageConfig.directories).toHaveProperty('cacheApi');
  });

  it('has cache policies with required fields', () => {
    expect(StorageConfig.cache.audio).toHaveProperty('ttlHours');
    expect(StorageConfig.cache.audio).toHaveProperty('maxSizeMB');
    expect(StorageConfig.cache.audio).toHaveProperty('cleanupOnStart');
    expect(typeof StorageConfig.cache.audio.ttlHours).toBe('number');
  });

  it('has api cache with ttlDays', () => {
    expect(StorageConfig.cache.api).toHaveProperty('ttlDays');
    expect(StorageConfig.cache.api).toHaveProperty('maxSizeMB');
    expect(StorageConfig.cache.api.maxSizeMB).toBeGreaterThan(0);
  });

  it('has retry configuration', () => {
    expect(StorageConfig.retry.maxAttempts).toBeGreaterThan(0);
    expect(StorageConfig.retry.initialDelayMs).toBeGreaterThan(0);
    expect(StorageConfig.retry.backoffMultiplier).toBeGreaterThan(1);
  });

  it('has recording format defaults', () => {
    expect(StorageConfig.formats.recording.defaultExtension).toBe('.wav');
    expect(StorageConfig.formats.recording.allowedExtensions).toContain('.wav');
    expect(StorageConfig.formats.recording.allowedExtensions.length).toBeGreaterThan(1);
  });

  it('has file name prefixes', () => {
    expect(StorageConfig.fileNames.recordingPrefix).toBe('rec');
    expect(StorageConfig.fileNames.cacheTempPrefix).toBe('temp');
  });
});
