import { describe, expect, it } from 'vitest';
import { groupByDay } from '@features/gallery/hooks/useGallery';
import type { GalleryImage } from '@services/storage/images.service';
import { calendarDayOffset, formatDayLabel } from '@shared/utils/formatters';

const image = (id: string, createdAt: number): GalleryImage => ({
  id,
  appPath: `images/${id}.png`,
  url: `asset://${id}`,
  thumbUrl: `asset://${id}.thumb`,
  createdAt,
  chatId: null,
  meta: { prompt: id, provider: 'p', model: 'm', aspectRatio: '1:1' },
});

describe('gallery days', () => {
  it('groups newest-first images into Today, Yesterday, then dated days', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();
    const days = groupByDay([image('a', at(18, 9)), image('b', at(18, 1)), image('c', at(17, 20)), image('d', at(12, 8))], now);
    expect(days.map((d) => [d.label, d.images.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      [formatDayLabel(at(12, 8), now), 1],
    ]);
  });
});

describe('calendar days', () => {
  it('counts local calendar days, not 24-hour spans, across a daylight-saving change', () => {
    // 2026-03-08 is a 23-hour day in US time zones; an hour after midnight on the 9th is still one day later.
    expect(calendarDayOffset(new Date(2026, 2, 9, 0, 30), new Date(2026, 2, 8, 23, 30))).toBe(1);
    expect(calendarDayOffset(new Date(2026, 2, 7, 12), new Date(2026, 2, 9, 12))).toBe(-2);
    expect(formatDayLabel(new Date(2026, 10, 17, 23, 59), new Date(2026, 10, 18, 0, 1))).toBe('Yesterday');
  });
});
