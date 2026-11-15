import { CHAT_LOADING_COPY } from '@config/chat.config';
import type { StreamMetadata } from '@services/ai/types';

/** A reply's header before its first word: what's happening, and how far along (null when unknown). */
export interface LoadingStatus {
  label: string;
  percent: number | null;
}

/** The header's status for the latest stream activity. */
export function loadingStatusOf(activity: StreamMetadata | null): LoadingStatus {
  if (activity?.progress) {
    return { label: CHAT_LOADING_COPY[activity.progress.stage], percent: activity.progress.percent };
  }
  return { label: CHAT_LOADING_COPY[activity?.isSearching ? 'searching' : 'working'], percent: null };
}
