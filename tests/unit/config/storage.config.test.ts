import { describe, it, expect } from 'vitest';
import { generateCacheFilename, StorageConfig } from '@config/storage.config';

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
  it('offers a Keep row only for classes the store knows', () => {
    const known = ['meetings', 'chats', 'dictations', ...Object.keys(StorageConfig.assetKinds)];
    for (const row of StorageConfig.retention.classes) expect(known).toContain(row.id);
  });

  it('keeps asset folders distinct and plain', () => {
    const dirs = Object.values(StorageConfig.assetKinds).map((k) => k.dir);
    expect(new Set(dirs).size).toBe(dirs.length);
    for (const dir of dirs) expect(dir).toMatch(/^[a-z]+$/);
  });

  it('offers increasing Keep periods', () => {
    const days = [...StorageConfig.retention.keepDays];
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });
});
