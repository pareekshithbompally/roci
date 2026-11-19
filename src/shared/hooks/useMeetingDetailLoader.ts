import { useCallback, useEffect, useRef } from 'react';
import { useAppActions } from '@shared/stores/appStore';
import { meetingService } from '@services/meeting.service';
import { summaryMarkdown } from '@core/ai';
import type { HistoryItem, MeetingDetail, ProcessedResult } from '@shared/types';


export function buildMeetingResult(detail: MeetingDetail): ProcessedResult {
  const structuredSummary = detail.summary
    ? {
        overview: detail.summary.overview,
        keyDiscussionPoints: detail.summary.keyDiscussionPoints,
        decisionsMade: detail.summary.decisionsMade,
        actionItems: detail.summary.actionItems.map((a) => ({
          id: crypto.randomUUID(),
          text: a.text,
          owner: a.owner,
          dueDate: a.dueDate,
          completed: false,
        })),
        nextSteps: detail.summary.nextSteps,
        enhancedNotes: detail.summary.enhancedNotes,
      }
    : undefined;

  return {
    title: detail.index.title,
    transcript: detail.transcript?.text || '',
    summary: summaryMarkdown(detail.summary),
    categories: detail.index.categories,
    structuredSummary,
    segments: detail.transcript?.segments,
  };
}

/** Load a meeting's detail (cache, else placeholder then disk); a generation counter makes the newest selection win. */
export function useMeetingDetailLoader() {
  const { setResult } = useAppActions();
  const generationRef = useRef(0);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  const loadMeetingDetail = useCallback(async (hi: HistoryItem) => {
    const generation = ++generationRef.current;
    if (hi.transcript || hi.summary) {
      setResult(hi);
      return;
    }
    setResult({ title: hi.title, transcript: '', summary: '', categories: hi.categories });
    try {
      const detail = await meetingService.getMeetingDetail(hi.id);
      if (generation !== generationRef.current) return;
      if (detail) setResult(buildMeetingResult(detail));
    } catch (error: unknown) {
      console.error('[useMeetingDetailLoader] Failed to load meeting detail:', error);
    }
  }, [setResult]);

  return loadMeetingDetail;
}
