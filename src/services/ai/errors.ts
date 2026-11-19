/** Every AI failure as one kind and one plain sentence saying what happened and what to do — whatever the provider (cloud
 *  SDK, Apple Intelligence, MLX). The sentence is what the user sees; the kind names the failure for logs and tests. */

import { APICallError, NoObjectGeneratedError } from 'ai';
import { appleFailureError, isContextWindowError } from '@services/ai/apple/contextWindow';
import { isAppleError } from '@services/ai/apple/appleIntelligence.service';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { errorMessage } from '@shared/utils/errors';

export type AiErrorKind = 'setup' | 'auth' | 'rateLimit' | 'contextWindow' | 'network' | 'cancelled' | 'badReply' | 'device' | 'unknown';

export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiError';
    this.kind = kind;
  }
}

/** What the call was for: names the setting to change in the sentence. */
export type AiJob = 'summary' | 'liveNotes' | 'chatTitle' | 'suggestions';

const SETTING: Record<AiJob, string> = { summary: 'Summary model', liveNotes: 'Summary model', chatTitle: 'chat model', suggestions: 'chat model' };

/** Providers' words for a prompt that didn't fit (Apple says it in its own payload). */
const CONTEXT_WORDS = /context (length|window)|maximum context|too many tokens|prompt is too long|input is too long|exceeds the (model'?s )?context/i;

/** Whether a call failed because its prompt didn't fit the model. */
export function isContextOverflow(error: unknown): boolean {
  if (isContextWindowError(error)) return true;
  return APICallError.isInstance(error) && CONTEXT_WORDS.test(`${error.message} ${error.responseBody ?? ''}`);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function apiCallError(error: APICallError, job: AiJob, provider: string): AiError {
  const name = getProviderTitle(provider);
  if (error.statusCode === 401 || error.statusCode === 403) {
    return new AiError('auth', `${name} refused the API key. Check it in Settings › Providers.`, { cause: error });
  }
  if (error.statusCode === 429) return new AiError('rateLimit', `${name} is limiting requests right now. Try again in a minute.`, { cause: error });
  if (isContextOverflow(error)) {
    return new AiError('contextWindow', `This is too long for the ${SETTING[job]}. Choose one with a larger context in Settings › Default Models.`, { cause: error });
  }
  return new AiError('unknown', `${name} couldn't answer (${error.statusCode ?? 'no response'}). Try again.`, { cause: error });
}

/** `error` as an `AiError` (an `AiError` passes through). `provider` names who failed. */
export function toAiError(error: unknown, job: AiJob, provider: string): AiError {
  if (error instanceof AiError) return error;
  if (isAbort(error)) return new AiError('cancelled', 'Stopped.', { cause: error });
  if (APICallError.isInstance(error)) return apiCallError(error, job, provider);
  if (NoObjectGeneratedError.isInstance(error)) {
    return new AiError('badReply', `The ${SETTING[job]} replied in a form Roci couldn't read. Try again, or choose another in Settings › Default Models.`, { cause: error });
  }
  // after the SDK's own errors: an Apple payload is any coded error, so it is recognised last
  if (isAppleError(error) || isAppleError((error as { cause?: unknown } | null)?.cause)) {
    const appleJob = job === 'summary' ? 'summary' : 'model';
    return new AiError(isContextWindowError(error) ? 'contextWindow' : 'device', errorMessage(appleFailureError(error, appleJob)), { cause: error });
  }
  if (error instanceof TypeError) {
    return new AiError('network', `Couldn't reach ${getProviderTitle(provider)}. Check your connection, then try again.`, { cause: error });
  }
  return new AiError('unknown', errorMessage(error) || 'Something went wrong. Try again.', { cause: error });
}
