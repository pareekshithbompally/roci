import { describe, expect, it } from 'vitest';
import { groupByDay } from '@features/gallery/hooks/useGallery';
import type { GalleryImage } from '@services/storage/images.service';

const image = (id: string, createdAt: number | null): GalleryImage => ({
  appPath: `images/${id}.png`,
  url: `asset://${id}`,
  details: createdAt === null ? null : { prompt: id, model: 'm', aspectRatio: '1:1', createdAt },
});

describe('gallery days', () => {
  it('groups newest-first images into Today, Yesterday, dated days, then Earlier', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();
    const days = groupByDay([image('a', at(18, 9)), image('b', at(18, 1)), image('c', at(17, 20)), image('d', at(12, 8)), image('e', null)], now);
    expect(days.map((d) => [d.label, d.images.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      [new Date(at(12, 8)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), 1],
      ['Earlier', 1],
    ]);
  });
});
