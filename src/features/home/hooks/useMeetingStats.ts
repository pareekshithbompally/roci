/** One meeting's facts for the stats card and the summary credit: when, how long, words, speakers, models, file. */

import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { getMeetingUsage, type MeetingUsage } from '@extensions/usage';
import { queryKeys } from '@shared/query/queryKeys';
import type { MeetingDetail } from '@shared/types';

/** A model that worked on the meeting; `provider` is empty when the stored id doesn't name one. */
export interface ModelCredit {
  provider: string;
  model: string;
}

export interface SummaryCredit extends ModelCredit {
  inputTokens: number;
  outputTokens: number;
  cost: number;
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

/** Transcripts store their speech model as `provider::model`. */
function speechModelOf(stored: string | undefined): ModelCredit | null {
  if (!stored) return null;
  const at = stored.indexOf('::');
  return at < 0 ? { provider: '', model: stored } : { provider: stored.slice(0, at), model: stored.slice(at + 2) };
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
