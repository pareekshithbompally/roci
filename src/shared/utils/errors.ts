/**
 * Errors — one way to read and report an `unknown` error everywhere.
 *
 * - `errorMessage`: the text of any thrown value.
 * - `isCodedError`: a native command's refusal, serialized by Rust as
 *   `{ code, detail? }` (serde `tag = "code"`), so callers can map codes to copy.
 * - `failureLogger`: `[Scope] action failed:` console reports, per the logging convention.
 */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isCodedError<T extends { code: string }>(error: unknown): error is T {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/** `failureLogger('Scope')('download')` → logs `[Scope] download failed:` with the error. */
export const failureLogger = (scope: string) => (action: string) => (error: unknown): void => {
  console.error(`[${scope}] ${action} failed:`, error);
};
