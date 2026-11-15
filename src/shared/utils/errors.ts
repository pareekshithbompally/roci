/** Read and report `unknown` errors: message text, coded native refusals (`{ code, detail? }`), scoped console logs. */

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
