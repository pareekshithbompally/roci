/** Where a chat's media loads from: a kept file (an image a tool made, or an attached file in `assets/`) through Tauri's asset
 *  protocol, cached; any other attachment by its own URL. Null once a kept file was removed; undefined while it resolves. */

import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { isAssetPath } from '@shared/utils/chatParts';
import type { FileUIPart, GeneratedImage } from '@shared/types';

/** What a message shows as media: an attached file (the SDK's file part), or an image a tool made. */
export type ChatMedia = FileUIPart | GeneratedImage;

/** The kept file's app path behind the media, if it is one. */
export function keptPathOf(media: ChatMedia): string | null {
  if ('path' in media) return media.path;
  return isAssetPath(media.url) ? media.url : null;
}

/** A kept file's URL through Tauri's asset protocol, or null once its asset row is gone. */
async function keptFileUrl(appPath: string): Promise<string | null> {
  return (await store.assets.exists(appPath)) ? assetsService.fileUrl(appPath) : null;
}

export function useMediaSrc(media: ChatMedia): string | null | undefined {
  const appPath = keptPathOf(media);
  const { data } = useQuery({
    queryKey: queryKeys.appFileUrl(appPath ?? ''),
    queryFn: () => keptFileUrl(appPath ?? ''),
    enabled: appPath !== null,
    staleTime: Infinity,
  });
  return appPath === null && 'url' in media ? media.url : data;
}
