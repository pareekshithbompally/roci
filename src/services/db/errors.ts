/** Typed store errors mirroring the Rust `{ code, message }` StoreError contract. */

export type StoreErrorCode =
  | 'not_found'
  | 'conflict'
  | 'invalid_input'
  | 'constraint'
  | 'io'
  | 'db';

export interface StoreError {
  code: StoreErrorCode;
  message: string;
}

export class StoreError extends Error {
  declare code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** Parses a raw invoke error into a StoreError, with code `db` when it isn't structured. */
export function parseStoreError(raw: unknown): StoreError {
  if (raw instanceof StoreError) return raw;

  const msg = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Unknown store error';
  const lower = msg.toLowerCase();

  // Try to parse JSON-shaped error from the Rust command
  try {
    const parsed = JSON.parse(msg) as { code?: string; message?: string };
    if (parsed.code && parsed.message) {
      return new StoreError(parsed.code as StoreErrorCode, parsed.message);
    }
  } catch { /* not JSON — fall through */ }

  // Heuristic mapping from error message
  if (lower.includes('not found') || lower.includes('no rows')) {
    return new StoreError('not_found', msg);
  }
  if (lower.includes('conflict') || lower.includes('unique')) {
    return new StoreError('conflict', msg);
  }
  if (lower.includes('constraint') || lower.includes('foreign key') || lower.includes('check')) {
    return new StoreError('constraint', msg);
  }
  if (lower.includes('io') || lower.includes('file') || lower.includes('permission')) {
    return new StoreError('io', msg);
  }

  return new StoreError('db', msg);
}
