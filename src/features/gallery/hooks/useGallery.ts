/** Generated images a page at a time, grouped by the day they were made (Today, Yesterday, then dates), and their count. */

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { store, type ItemCursor } from '@services/db';
import { imagesService, type GalleryImage } from '@services/storage/images.service';
import { queryKeys } from '@shared/query/queryKeys';
import { isTauriEnvironment } from '@services/tauri';
import { formatDayLabel, groupByLabel } from '@shared/utils/formatters';
import { GALLERY_CONFIG } from '@config/gallery.config';

export interface GalleryDay {
  label: string;
  images: GalleryImage[];
}

/** Groups newest-first images into consecutive days. */
export function groupByDay(images: GalleryImage[], now = new Date()): GalleryDay[] {
  return groupByLabel(images, (image) => formatDayLabel(image.createdAt, now))
    .map(({ label, items }) => ({ label, images: items }));
}

/** The days loaded so far, the total count, and loading the next page as the grid nears its end. */
export function useGallery() {
  const enabled = isTauriEnvironment();
  const pages = useInfiniteQuery({
    queryKey: queryKeys.galleryPages(),
    queryFn: ({ pageParam }) => imagesService.imagesPage(pageParam, GALLERY_CONFIG.pageSize),
    initialPageParam: null as ItemCursor | null,
    getNextPageParam: (page): ItemCursor | undefined => {
      const last = page[page.length - 1];
      return page.length < GALLERY_CONFIG.pageSize || !last ? undefined : { at: last.createdAt, id: last.id };
    },
    enabled,
  });
  const { data: count = 0 } = useQuery({ queryKey: queryKeys.galleryCount(), queryFn: () => store.assets.count('image'), enabled });
  const days = useMemo(() => groupByDay((pages.data?.pages ?? []).flat()), [pages.data]);
  return {
    days,
    count,
    isLoading: pages.isLoading,
    hasMore: pages.hasNextPage,
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => {
      pages.fetchNextPage().catch((error: unknown) => console.error('[Gallery] Loading older images failed:', error));
    },
  };
}
