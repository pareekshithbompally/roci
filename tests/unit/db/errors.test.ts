import { describe, it, expect } from 'vitest';
import { parseStoreError, StoreError } from '@services/db/errors';

describe('parseStoreError', () => {
  it('passes through an existing StoreError', () => {
    const original = new StoreError('not_found', 'Meeting not found');
    const result = parseStoreError(original);
    expect(result).toBe(original);
    expect(result.code).toBe('not_found');
  });

  it('parses a JSON-shaped Rust error into typed StoreError', () => {
    const json = JSON.stringify({ code: 'constraint', message: 'FOREIGN KEY violation' });
    const result = parseStoreError(json);
    expect(result.code).toBe('constraint');
    expect(result.message).toBe('FOREIGN KEY violation');
  });

  it('maps "not found" messages to not_found', () => {
    const result = parseStoreError('Entity not found');
    expect(result.code).toBe('not_found');
  });

  it('maps "conflict" / "unique" messages to conflict', () => {
    expect(parseStoreError('UNIQUE constraint failed').code).toBe('conflict');
    expect(parseStoreError('conflict: duplicate key').code).toBe('conflict');
  });

  it('maps "foreign key" / "check" messages to constraint', () => {
    expect(parseStoreError('FOREIGN KEY constraint failed').code).toBe('constraint');
    expect(parseStoreError('CHECK constraint failed').code).toBe('constraint');
  });

  it('maps "io" / "file" / "permission" messages to io', () => {
    expect(parseStoreError('IO error: file missing').code).toBe('io');
    expect(parseStoreError('permission denied').code).toBe('io');
  });

  it('falls back to db for unrecognized errors', () => {
    const result = parseStoreError('Something bizarre happened');
    expect(result.code).toBe('db');
    expect(result.message).toBe('Something bizarre happened');
  });

  it('handles Error instances', () => {
    const err = new Error('UNIQUE constraint failed: meetings.id');
    const result = parseStoreError(err);
    expect(result.code).toBe('conflict');
  });

  it('handles unknown type gracefully', () => {
    const result = parseStoreError(42);
    expect(result.code).toBe('db');
    expect(result.message).toBe('Unknown store error');
  });
});
