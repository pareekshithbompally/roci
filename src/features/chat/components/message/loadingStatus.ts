import { CHAT_LOADING_COPY, CHAT_LOADING_DETAIL } from '@config/chat.config';
import type { StreamMetadata } from '@services/ai/types';

/** A reply's header before its first word: what's happening, how far along, and any detail (null when unknown). */
export interface LoadingStatus {
  label: string;
  percent: number | null;
  detail: string | null;
}

/** What the model is doing when the server reports no progress. */
function activityStage(activity: StreamMetadata | null): 'thinking' | 'searching' | 'working' {
  if (activity?.isThinking) return 'thinking';
  return activity?.isSearching ? 'searching' : 'working';
}

/** Time left reading the prompt, or tokens and speed while thinking, when the server reports them. */
function detailOf(activity: StreamMetadata | null): string | null {
  const secondsLeft = activity?.progress?.secondsLeft;
  if (secondsLeft !== undefined) return CHAT_LOADING_DETAIL.secondsLeft(secondsLeft);
  const generation = activity?.isThinking ? activity.generation : undefined;
  return generation ? CHAT_LOADING_DETAIL.generation(generation.tokens, generation.tokensPerSecond) : null;
}

/** The header's status for the latest stream activity. */
export function loadingStatusOf(activity: StreamMetadata | null): LoadingStatus {
  const detail = detailOf(activity);
  if (activity?.progress) {
    return { label: CHAT_LOADING_COPY[activity.progress.stage], percent: activity.progress.percent, detail };
  }
  return { label: CHAT_LOADING_COPY[activityStage(activity)], percent: null, detail };
}
