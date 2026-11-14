/**
 * useTranscribeRecording Hook
 *
 * Encapsulates the flow: load recording blob -> processAudio -> save via transcriptionService.
 * Used by sidebar (Transcribe/Re-transcribe) and ResultsView.
 */

import { notifyAppEvent } from '@shared/utils/appEvents';
import { useCallback } from 'react';
import { recordingsService } from '@services/storage';
import { unifiedAIService } from '@services/unifiedAIService';
import { transcriptionService, meetingSummaryOf } from '@services/transcription.service';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useAppActions } from '@shared/stores/appStore';
import { useToast } from '@shared/contexts/ToastContext';
import { AppStatus } from '@shared/types';
import type { HistoryItem } from '@shared/types';
import { meetingJobs, useMeetingJobsStore } from '@shared/stores/meetingJobsStore';
import { deriveMeetingPhase, isMeetingBusy, type MeetingPipelineStage } from '@shared/types/meetingPhase';

interface UseTranscribeRecordingReturn {
  /** Runs transcribe → summarize → save; progress and failure go to meetingJobsStore (read via useMeetingPhase). */
  transcribe: (item: HistoryItem) => Promise<void>;
}

export const useTranscribeRecording = (): UseTranscribeRecordingReturn => {
  const { categories, updateItem } = useHistoryData();
  const { settings, providers } = useSettings();
  const { setResult, setSelectedHistoryId, setStatus } = useAppActions();
  const { showToast } = useToast();

  const transcribe = useCallback(async (item: HistoryItem) => {
    if (!item.recordingFileName) {
      showToast('No recording file found for this item', 'error');
      return;
    }

    const running = useMeetingJobsStore.getState().jobs[item.id];
    if (isMeetingBusy(deriveMeetingPhase(running, item))) return;

    let stage: MeetingPipelineStage = 'transcribe';
    meetingJobs.set(item.id, { stage: 'transcribing', part: null });

    try {
      // Load recording data from storage
      const dataResult = await recordingsService.getRecordingData(item.recordingFileName);
      if (!dataResult.success || !dataResult.data) {
        throw new Error('Could not load recording audio data');
      }

      const audioBlob = new Blob([dataResult.data], { type: 'audio/wav' });

      // Build meeting context from calendar metadata if available
      const meetingContext = item.scheduledStart && item.participants?.length
        ? {
            title: item.scheduledTitle || item.title,
            participants: item.participants.map((p: { name?: string; email?: string }) => ({
              name: p.name,
              email: p.email,
            })),
            scheduledStart: item.scheduledStart,
          }
        : undefined;

      // Process with unified AI service
      const data = await unifiedAIService.processAudio(
        audioBlob,
        categories,
        settings,
        providers,
        {
          meetingContext,
          meetingId: item.id,
          onProgress: (part) => meetingJobs.set(item.id, { stage: 'transcribing', part }),
          onSummarizing: () => {
            stage = 'summarize';
            meetingJobs.set(item.id, { stage: 'summarizing' });
          },
        },
      );

      const meetingSummary = meetingSummaryOf(data);

      // Save everything via transcription service (single call)
      await transcriptionService.saveTranscriptionResult({
        meetingId: item.id,
        title: data.title || item.title,
        transcript: data.transcript,
        summary: meetingSummary,
        categories: data.categories,
        recordingFileName: item.recordingFileName,
        inputSource: item.inputSource,
        model: settings.transcriptionModel,
        segments: data.segments,
        calendarMeta: item.calendarEventId ? {
          calendarEventId: item.calendarEventId,
          scheduledTitle: item.scheduledTitle || item.title,
          participants: item.participants || [],
          scheduledStart: item.scheduledStart!,
          scheduledEnd: item.scheduledEnd!,
          meetingUrl: item.meetingUrl,
        } : undefined,
      });

      // Update global history state: clear pendingTranscription flag and update title.
      // This single push fixes the stuck amber Mic icon, ResultsView button state,
      // and stale meeting title in the sidebar.
      await updateItem(item.id, {
        title: data.title || item.title,
        pendingTranscription: false,
      });

      // Show results
      setResult(data);
      setSelectedHistoryId(item.id);
      setStatus(AppStatus.RESULTS);

      meetingJobs.clear(item.id);
      notifyAppEvent({ id: `recording-ready:${item.id}`, kind: 'recordingReady', tone: 'success', inFront: 'quiet', title: item.title, body: 'Transcript and summary are ready.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to transcribe recording';
      console.error('[useTranscribeRecording] Error:', error);
      meetingJobs.set(item.id, { stage: 'failed', failedAt: stage, message });
      notifyAppEvent({ id: `recording-ready:${item.id}`, kind: 'recordingReady', tone: 'error', inFront: 'toast', title: 'Transcription failed', body: message });
    }
  }, [categories, settings, providers, updateItem, setResult, setSelectedHistoryId, setStatus, showToast]);

  return { transcribe };
};

export default useTranscribeRecording;
