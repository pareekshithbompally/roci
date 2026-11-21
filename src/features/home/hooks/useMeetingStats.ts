/** One meeting's facts for the stats card and the summary credit: when, how long, words, speakers, models, file. */

import { parseModelKey } from '@services/ai/models';
import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { getMeetingUsage, type MeetingUsage } from '@extensions/usage';
import { queryKeys } from '@shared/query/queryKeys';
import type { MeetingDetail } from '@shared/types';
import type { ModelCredit } from '@shared/components';


export interface SummaryCredit extends ModelCredit {
  inputTokens: number;
  outputTokens: number;
  /** Null when the summary model's price is unknown. */
  cost: number | null;
}

export interface MeetingStats {
  recordedAt: string;
  durationSeconds: number | null;
  inputSource: string | null;
  words: number;
  speakers: number;
  transcribedBy: ModelCredit | null;
  summarizedBy: SummaryCredit | null;
  recording: { filename: string; path: string; sizeBytes: number } | null;
}

/** Transcripts store their speech model as its model key; an older bare id has no provider. */
function speechModelOf(stored: string | undefined): ModelCredit | null {
  if (!stored) return null;
  return parseModelKey(stored) ?? { provider: '', model: stored };
}

function summaryModelOf(usage: MeetingUsage[]): SummaryCredit | null {
  const latest = usage.find((row) => row.category === 'summary');
  if (!latest) return null;
  return {
    provider: latest.provider,
    model: latest.model,
    inputTokens: latest.input_tokens,
    outputTokens: latest.output_tokens,
    cost: latest.estimated_cost,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

async function loadStats(meetingId: string): Promise<MeetingStats | null> {
  const [detail, usage] = await Promise.all([store.meetings.get(meetingId), getMeetingUsage(meetingId)]);
  if (!detail) return null;
  return statsOf(detail, usage, await recordingOf(detail));
}

async function recordingOf(detail: MeetingDetail): Promise<MeetingStats['recording']> {
  const filename = detail.recording?.filename;
  if (!filename) return null;
  const file = await recordingsService.recordingFile(filename);
  return file ? { filename, ...file } : null;
}

function statsOf(detail: MeetingDetail, usage: MeetingUsage[], recording: MeetingStats['recording']): MeetingStats {
  const segments = detail.transcript?.segments ?? [];
  return {
    recordedAt: detail.index.createdAt,
    durationSeconds: detail.recording?.duration ?? null,
    inputSource: detail.recording?.inputSource ?? detail.index.inputSource ?? null,
    words: countWords(detail.transcript?.text ?? ''),
    speakers: new Set(segments.map((s) => s.speaker).filter(Boolean)).size,
    transcribedBy: speechModelOf(detail.transcript?.model),
    summarizedBy: summaryModelOf(usage),
    recording,
  };
}

export function useMeetingStats(meetingId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.meetingStats(meetingId ?? ''),
    queryFn: () => loadStats(meetingId!),
    enabled: !!meetingId,
  });
}
