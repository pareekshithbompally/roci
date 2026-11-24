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

/** A provider error as people read it: the innermost `message` (or `error` text) of a JSON payload, however deeply it is
 *  nested or stringified (`Error: {"error":{"message":"…"}}`); the text itself when it isn't JSON; null when there is none. */
export function readableErrorText(raw: string): string | null {
  const text = raw.trim().replace(/^Error:\s*/, '');
  const parsed = parseJson(text);
  if (parsed === undefined) return text || null;
  return messageIn(parsed);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The innermost readable message in a parsed error payload (a string may itself be JSON). */
function messageIn(value: unknown): string | null {
  if (typeof value === 'string') {
    const inner = parseJson(value);
    return inner === undefined ? value : messageIn(inner);
  }
  if (typeof value !== 'object' || value === null) return null;
  const { error, message } = value as { error?: unknown; message?: unknown };
  return (error !== undefined ? messageIn(error) : null) ?? (typeof message === 'string' ? messageIn(message) : null);
}
