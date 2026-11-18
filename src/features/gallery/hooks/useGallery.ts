/** Every generated image, grouped by the day it was made (Today, Yesterday, then dates); older images without details last. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesService, type GalleryImage } from '@services/storage/images.service';
import { queryKeys } from '@shared/query/queryKeys';
import { isTauriEnvironment } from '@services/tauri';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { formatDayLabel, groupByLabel } from '@shared/utils/formatters';

export interface GalleryDay {
  label: string;
  images: GalleryImage[];
}

/** Groups newest-first images into consecutive days. */
export function groupByDay(images: GalleryImage[], now = new Date()): GalleryDay[] {
  return groupByLabel(images, (image) => (image.details ? formatDayLabel(image.details.createdAt, now) : GALLERY_CONFIG.earlier))
    .map(({ label, items }) => ({ label, images: items }));
}

export function useGallery() {
  const { data: images = [], isLoading } = useQuery({
    queryKey: queryKeys.gallery(),
    queryFn: () => imagesService.listImages(),
    enabled: isTauriEnvironment(),
  });
  const days = useMemo(() => groupByDay(images), [images]);
  return { days, count: images.length, isLoading };
}
