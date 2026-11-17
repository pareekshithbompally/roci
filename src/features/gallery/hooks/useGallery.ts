/** Every generated image, grouped by the day it was made (Today, Yesterday, then dates); older images without details last. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesService, type GalleryImage } from '@services/storage/images.service';
import { queryKeys } from '@shared/query/queryKeys';
import { isTauriEnvironment } from '@services/tauri';
import { GALLERY_CONFIG } from '@config/gallery.config';

export interface GalleryDay {
  label: string;
  images: GalleryImage[];
}

const DAY_MS = 86_400_000;

function dayLabel(createdAt: number, todayStart: number): string {
  if (createdAt >= todayStart) return 'Today';
  if (createdAt >= todayStart - DAY_MS) return 'Yesterday';
  return new Date(createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Groups newest-first images into consecutive days. */
export function groupByDay(images: GalleryImage[], now = new Date()): GalleryDay[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days: GalleryDay[] = [];
  for (const image of images) {
    const label = image.details ? dayLabel(image.details.createdAt, todayStart) : GALLERY_CONFIG.earlier;
    const last = days.at(-1);
    if (last?.label === label) last.images.push(image);
    else days.push({ label, images: [image] });
  }
  return days;
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
