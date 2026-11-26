/** One Gallery folder a page at a time (images; kept sound or video), grouped by the day each was made (Today, Yesterday,
 *  then dates); its count; and Delete for kept sound and video (optimistic, rolled back on failure). */

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { store, type ItemCursor } from '@services/db';
import { mediaService } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { formatDayLabel, groupByLabel } from '@shared/utils/formatters';
import { GALLERY_CONFIG } from '@config/gallery.config';

export type FolderKind = (typeof GALLERY_CONFIG.folders)[number]['kind'];

/** What a folder lists: anything with an id and when it was made. */
interface Dated {
  id: string;
  createdAt: number;
}

/** Images are every image made in chat; sound and video only what you kept. */
const keptOnly = (kind: FolderKind) => kind !== 'image';

/** How many the folder holds ("12 images"). */
export function useGalleryCount(kind: FolderKind): number {
  const { data = 0 } = useQuery({
    queryKey: queryKeys.galleryCount(kind),
    queryFn: () => store.assets.count(kind, keptOnly(kind)),
    enabled: isTauriEnvironment(),
  });
  return data;
}

/** The folder's days loaded so far, and loading the next page as the list nears its end. */
export function useGalleryFolder<T extends Dated>(kind: FolderKind, pageOf: (before: ItemCursor | null, limit: number) => Promise<T[]>) {
  const pages = useInfiniteQuery({
    queryKey: queryKeys.galleryFolder(kind),
    queryFn: ({ pageParam }) => pageOf(pageParam, GALLERY_CONFIG.pageSize),
    initialPageParam: null as ItemCursor | null,
    getNextPageParam: (page): ItemCursor | undefined => {
      const last = page[page.length - 1];
      return page.length < GALLERY_CONFIG.pageSize || !last ? undefined : { at: last.createdAt, id: last.id };
    },
    enabled: isTauriEnvironment(),
  });
  const days = useMemo(() => groupByLabel((pages.data?.pages ?? []).flat(), (item) => formatDayLabel(item.createdAt)), [pages.data]);
  return {
    days,
    isLoading: pages.isLoading,
    error: pages.error,
    hasMore: pages.hasNextPage,
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => {
      pages.fetchNextPage().catch((error: unknown) => console.error('[Gallery] Loading older items failed:', error));
    },
  };
}

/** Delete for a folder of kept sound or video: gone from the list at once, back if the delete fails. */
export function useRemoveGalleryItem(kind: FolderKind): (id: string) => void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const key = queryKeys.galleryFolder(kind);
  const remove = useMutation({
    mutationFn: (id: string) => mediaService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<Dated[]>>(key);
      queryClient.setQueryData<InfiniteData<Dated[]>>(key, (old) => old && { ...old, pages: old.pages.map((page) => page.filter((item) => item.id !== id)) });
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[Gallery] Delete failed:', error);
      showToast(GALLERY_CONFIG.deleteFailed, 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.gallery() }),
  });
  return remove.mutate;
}
