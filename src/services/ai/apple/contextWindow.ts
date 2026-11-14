import { getProviderType, type ResolvedModel } from '@shared/utils/modelResolver';
import { appleIntelligence, isAppleError } from './appleIntelligence.service';

/** The model's context window when it is small enough to matter (Apple Intelligence); null otherwise. */
export async function contextTokensFor(resolved: ResolvedModel): Promise<number | null> {
  if (getProviderType(resolved.provider) !== 'apple-intelligence') return null;
  return (await appleIntelligence.status()).contextTokens || null;
}

/** The Apple Intelligence failure inside an AI SDK error (it may be wrapped as `cause`). */
function appleFailure(error: unknown) {
  const cause = error instanceof Error && 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  return [error, cause].find(isAppleError);
}

/** Whether an AI SDK call failed because the prompt didn't fit. */
export function isContextWindowError(error: unknown): boolean {
  return appleFailure(error)?.code === 'context-window';
}

const OTHER_MODEL = 'Choose another Summary model in Settings › Audio, then retry.';

/** A sentence for the meeting's Failed state; non-Apple errors pass through unchanged. */
export function summaryError(error: unknown): unknown {
  const failure = appleFailure(error);
  if (!failure) return error;
  switch (failure.code) {
    case 'refused': return new Error(`Apple Intelligence declined this transcript. ${OTHER_MODEL}`);
    case 'context-window': return new Error(`This meeting is too long for Apple Intelligence. ${OTHER_MODEL}`);
    case 'timeout': return new Error('Apple Intelligence took too long. Retry.');
    case 'unavailable': return new Error(failure.detail ?? 'Apple Intelligence is unavailable on this Mac.');
    default: return new Error(`Apple Intelligence couldn't summarize this meeting (${failure.detail ?? failure.code}).`);
  }
}
