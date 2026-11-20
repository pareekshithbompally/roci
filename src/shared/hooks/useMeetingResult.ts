/** The open meeting as the meeting view reads it: one Query read of the store when it's opened, under the `meetings` key, so
 *  every change the store announces (`meeting://changed`) reads it again. `loading` until that first read lands. */

import { useQuery } from '@tanstack/react-query';
import { meetingService } from '@services/meeting.service';
import { summaryMarkdown } from '@core/ai';
import { queryKeys } from '@shared/query/queryKeys';
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

/** The open meeting for the view: null when none is open; `loading` while its first read is in flight. */
export function useMeetingResult(id: string | null): { result: ProcessedResult | null; loading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.meetingDetail(id ?? ''),
    queryFn: async () => {
      const detail = await meetingService.getMeetingDetail(id ?? '');
      return detail ? buildMeetingResult(detail) : null;
    },
    enabled: id !== null,
  });
  return { result: id === null ? null : data ?? null, loading: id !== null && isPending };
}
