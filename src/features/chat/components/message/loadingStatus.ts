import { CHAT_LOADING_COPY, CHAT_LOADING_DETAIL } from '@config/chat.config';
import type { StreamMetadata } from '@services/ai/types';

/** A reply's header before its first word: what's happening, how far along, and any detail (null when unknown). */
export interface LoadingStatus {
  label: string;
  percent: number | null;
  detail: string | null;
}

/** The header's status for the latest stream activity. */
export function loadingStatusOf(activity: StreamMetadata | null): LoadingStatus {
  const progress = activity?.progress;
  if (progress) {
    const detail = progress.secondsLeft === undefined ? null : CHAT_LOADING_DETAIL.secondsLeft(progress.secondsLeft);
    return { label: CHAT_LOADING_COPY[progress.stage], percent: progress.percent, detail };
  }
  return { label: CHAT_LOADING_COPY[activity?.isSearching ? 'searching' : 'working'], percent: null, detail: null };
}
