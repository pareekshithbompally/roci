/** Apple Intelligence failures: whether the prompt didn't fit, and the one sentence each failure shows, per job. */

import { isAppleError } from './appleIntelligence.service';
import type { AppleErrorPayload } from './appleIntelligence.service';

/** The Apple Intelligence failure inside an AI SDK error (it may be wrapped as `cause`). */
function appleFailure(error: unknown) {
  const cause = error instanceof Error && 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  return [error, cause].find(isAppleError);
}

/** Whether an AI SDK call failed because the prompt didn't fit. */
export function isContextWindowError(error: unknown): boolean {
  return appleFailure(error)?.code === 'context-window';
}

/** Each job's words for what failed and what to do next. */
const JOBS = {
  /** Any call through the model (chat, titles): the AI SDK adapter's errors. */
  model: {
    subject: 'this request',
    tooLong: 'This conversation',
    nextStep: 'Start a new chat, or choose another Chat model in Settings › Default Models.',
    action: 'respond',
  },
  summary: {
    subject: 'this transcript',
    tooLong: 'This meeting',
    nextStep: 'Choose another Summary model in Settings › Default Models, then retry.',
    action: 'summarize this meeting',
  },
} as const;

/** A sentence for an Apple failure, the payload kept as `cause`; non-Apple errors pass through unchanged. */
export function appleFailureError(error: unknown, job: keyof typeof JOBS): unknown {
  const failure = appleFailure(error);
  if (!failure) return error;
  const copy = JOBS[job];
  const messages: Partial<Record<AppleErrorPayload['code'], string>> = {
    refused: `Apple Intelligence declined ${copy.subject}. ${copy.nextStep}`,
    'context-window': `${copy.tooLong} is too long for Apple Intelligence. ${copy.nextStep}`,
    timeout: 'Apple Intelligence took too long. Retry.',
    unavailable: failure.detail ?? 'Apple Intelligence is unavailable on this Mac.',
  };
  const message = messages[failure.code] ?? `Apple Intelligence couldn't ${copy.action} (${failure.detail ?? failure.code}).`;
  return new Error(message, { cause: failure });
}

/** The model reads text only; a message of attachments alone has nothing to answer. */
export const TEXT_ONLY_ERROR = 'Apple Intelligence reads text only. Ask your question in words, or choose another Chat model.';

/** A sentence for the meeting's Failed state. */
export const summaryError = (error: unknown): unknown => appleFailureError(error, 'summary');
