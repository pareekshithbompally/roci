/** Chat parts that carry media, and the app-data file a part shows. */

import type { ChatPart, MediaSource } from '@shared/types';

export type MediaPart = Extract<ChatPart, { source: MediaSource }>;

export const isMediaPart = (part: ChatPart): part is MediaPart =>
  part.type === 'image' || part.type === 'audio' || part.type === 'video' || part.type === 'document';

/** The app-data path a part shows (`images/….png`), or null when it shows a URL, inline data or no media. */
export function appFileOf(part: ChatPart): string | null {
  return isMediaPart(part) && part.source.kind === 'file' ? part.source.path : null;
}
