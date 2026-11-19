/** The open meeting as the meeting view reads it: one Query read of the store, under the `meetings` key, so every change the
 *  store announces (`meeting://changed`) reads it again. While it loads, the listed title shows, so the view is never empty. */

import { useQuery } from '@tanstack/react-query';
import { meetingService } from '@services/meeting.service';
import { summaryMarkdown } from '@core/ai';
import { queryKeys } from '@shared/query/queryKeys';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { structuredSummaryOf } from '@shared/utils/structuredSummary';
import type { MeetingDetail, ProcessedResult } from '@shared/types';

/** A stored meeting as the view's result (summary as Markdown and as fields). */
export function buildMeetingResult(detail: MeetingDetail): ProcessedResult {

  return {
    title: detail.index.title,
    transcript: detail.transcript?.text || '',
    summary: summaryMarkdown(detail.summary),
    categories: detail.index.categories,
    structuredSummary: detail.summary ? structuredSummaryOf(detail.summary) : undefined,
    segments: detail.transcript?.segments,
  };
}

/** The meeting `id` for the view; null when none is open. */
export function useMeetingResult(id: string | null): ProcessedResult | null {
  const listed = useHistoryData().items.find((item) => item.id === id);
  const { data } = useQuery({
    queryKey: queryKeys.meetingDetail(id ?? ''),
    queryFn: async () => {
      const detail = await meetingService.getMeetingDetail(id ?? '');
      return detail ? buildMeetingResult(detail) : null;
    },
    enabled: id !== null,
    placeholderData: listed ? { title: listed.title, transcript: '', summary: '', categories: listed.categories } : undefined,
  });
  return id === null ? null : data ?? null;
}
