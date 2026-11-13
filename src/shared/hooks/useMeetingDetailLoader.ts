import { useCallback, useEffect, useRef } from 'react';
import { useAppActions } from '@shared/stores/appStore';
import { meetingService } from '@services/meeting.service';
import type { HistoryItem, MeetingDetail, ProcessedResult } from '@shared/types';

function buildSummaryMarkdown(summary: MeetingDetail['summary']): string {
  if (!summary) return '';
  const lines: string[] = [];
  lines.push(`## Meeting Overview\n${summary.overview}`);
  lines.push(`## Key Discussion Points\n${summary.keyDiscussionPoints.map((p) => `- ${p}`).join('\n')}`);
  lines.push(`## Decisions Made\n${summary.decisionsMade.map((d) => `- ${d}`).join('\n')}`);
  lines.push(
    `## Action Items\n${summary.actionItems
      .map((a) => `- ${a.text}${a.owner ? ` - Owner: ${a.owner}` : ''}${a.dueDate ? ` - Due: ${a.dueDate}` : ''}`)
      .join('\n')}`,
  );
  lines.push(`## Next Steps\n${summary.nextSteps.map((s) => `- ${s}`).join('\n')}`);
  return lines.join('\n\n');
}

function buildMeetingResult(detail: MeetingDetail): ProcessedResult {
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
      }
    : undefined;

  return {
    title: detail.index.title,
    transcript: detail.transcript?.text || '',
    summary: buildSummaryMarkdown(detail.summary),
    categories: detail.index.categories,
    structuredSummary,
    segments: detail.transcript?.segments,
  };
}

/**
 * Load a meeting's full detail into the result view.
 *
 * Uses the cached transcript/summary when present; otherwise shows a
 * placeholder immediately and fills in the disk detail when it arrives.
 * A generation counter drops late responses when the user selects another
 * item before the load finishes — the newest selection always wins.
 */
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
