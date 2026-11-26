/** One Gallery folder of sound or video (Audio, Video), a page at a time, grouped by the day it was made, with its count and
 *  Delete (optimistic, rolled back on failure). */

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { store, type ItemCursor } from '@services/db';
import { mediaService, type GalleryMedia, type GalleryMediaKind } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { formatDayLabel, groupByLabel } from '@shared/utils/formatters';
import { GALLERY_CONFIG } from '@config/gallery.config';

type Pages = InfiniteData<GalleryMedia[], ItemCursor | null>;

export function useGalleryMedia(kind: GalleryMediaKind) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const enabled = isTauriEnvironment();
  const key = queryKeys.galleryMedia(kind);
  const pages = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => mediaService.page(kind, pageParam, GALLERY_CONFIG.pageSize),
    initialPageParam: null as ItemCursor | null,
    getNextPageParam: (page): ItemCursor | undefined => {
      const last = page[page.length - 1];
      return page.length < GALLERY_CONFIG.pageSize || !last ? undefined : { at: last.createdAt, id: last.id };
    },
    enabled,
  });
  const { data: count = 0 } = useQuery({ queryKey: queryKeys.galleryMediaCount(kind), queryFn: () => store.assets.count(kind), enabled });
  const days = useMemo(
    () => groupByLabel((pages.data?.pages ?? []).flat(), (item) => formatDayLabel(item.createdAt)),
    [pages.data],
  );

  const remove = useMutation({
    mutationFn: (id: string) => mediaService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Pages>(key);
      queryClient.setQueryData<Pages>(key, (old) => old && { ...old, pages: old.pages.map((page) => page.filter((item) => item.id !== id)) });
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[Gallery] Delete failed:', error);
      showToast(GALLERY_CONFIG.deleteFailed, 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    days,
    count,
    isLoading: pages.isLoading,
    hasMore: pages.hasNextPage,
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => {
      pages.fetchNextPage().catch((error: unknown) => console.error('[Gallery] Loading older items failed:', error));
    },
    remove: remove.mutate,
  };
}
