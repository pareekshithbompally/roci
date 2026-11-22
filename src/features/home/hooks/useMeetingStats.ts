/** One meeting's facts for the stats card and the summary credit: when, how long, words, speakers, models, costs, file. The
 *  meeting's own facts load once per meeting; its AI calls come from the shared session usage, so a new call updates them. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { sessionCostOf, type SessionCost, type SessionUsage } from '@extensions/usage';
import { queryKeys } from '@shared/query/queryKeys';
import { useSessionUsage } from '@shared/hooks/useSessionUsage';
import type { MeetingDetail } from '@shared/types';
import { modelCreditOf, type ModelCredit } from '@shared/components';

export interface SummaryCredit extends ModelCredit {
  inputTokens: number;
  outputTokens: number;
}

/** What the meeting's AI calls did and cost. */
interface UsageStats {
  summarizedBy: SummaryCredit | null;
  transcriptCost: SessionCost | null;
  summaryCost: SessionCost | null;
}

interface MeetingFacts {
  recordedAt: string;
  durationSeconds: number | null;
  inputSource: string | null;
  words: number;
  speakers: number;
  transcribedBy: ModelCredit | null;
  recording: { filename: string; path: string; sizeBytes: number } | null;
}

export type MeetingStats = MeetingFacts & UsageStats;

const NO_USAGE: UsageStats = { summarizedBy: null, transcriptCost: null, summaryCost: null };

function summaryModelOf(usage: SessionUsage[]): SummaryCredit | null {
  const latest = usage.find((row) => row.category === 'summary');
  if (!latest) return null;
  return { provider: latest.provider, model: latest.model, inputTokens: latest.input_tokens, outputTokens: latest.output_tokens };
}

/** Module-level, so the shared usage query runs it only when the rows change. */
function usageStatsOf(usage: SessionUsage[]): UsageStats {
  return {
    summarizedBy: summaryModelOf(usage),
    transcriptCost: sessionCostOf(usage.filter((row) => row.category === 'transcription')),
    summaryCost: sessionCostOf(usage.filter((row) => row.category === 'summary')),
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

async function loadFacts(meetingId: string): Promise<MeetingFacts | null> {
  const detail = await store.meetings.get(meetingId);
  if (!detail) return null;
  return factsOf(detail, await recordingOf(detail));
}

async function recordingOf(detail: MeetingDetail): Promise<MeetingFacts['recording']> {
  const filename = detail.recording?.filename;
  if (!filename) return null;
  const file = await recordingsService.recordingFile(filename);
  return file ? { filename, ...file } : null;
}

function factsOf(detail: MeetingDetail, recording: MeetingFacts['recording']): MeetingFacts {
  const segments = detail.transcript?.segments ?? [];
  return {
    recordedAt: detail.index.createdAt,
    durationSeconds: detail.recording?.duration ?? null,
    inputSource: detail.recording?.inputSource ?? detail.index.inputSource ?? null,
    words: countWords(detail.transcript?.text ?? ''),
    speakers: new Set(segments.map((s) => s.speaker).filter(Boolean)).size,
    transcribedBy: modelCreditOf(detail.transcript?.model),
    recording,
  };
}

export function useMeetingStats(meetingId: string | null | undefined) {
  const facts = useQuery({
    queryKey: queryKeys.meetingStats(meetingId ?? ''),
    queryFn: () => loadFacts(meetingId!),
    enabled: !!meetingId,
  });
  const usage = useSessionUsage(meetingId, usageStatsOf);
  const data = useMemo<MeetingStats | null | undefined>(
    () => facts.data && { ...facts.data, ...(usage ?? NO_USAGE) },
    [facts.data, usage],
  );
  return { data, isPending: facts.isPending };
}
