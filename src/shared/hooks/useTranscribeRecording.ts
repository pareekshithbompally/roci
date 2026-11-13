/**
 * useTranscribeRecording Hook
 *
 * Encapsulates the flow: load recording blob -> processAudio -> save via transcriptionService.
 * Used by sidebar (Transcribe/Re-transcribe) and ResultsView.
 */

import { useState, useCallback } from 'react';
import { recordingsService } from '@services/storage';
import { unifiedAIService } from '@services/unifiedAIService';
import { transcriptionService } from '@services/transcription.service';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useAppActions } from '@shared/stores/appStore';
import { useToast } from '@shared/contexts/ToastContext';
import { AppStatus } from '@shared/types';
import { logUsage } from '@extensions/usage';
import { resolveModel } from '@shared/utils/modelResolver';
import type { HistoryItem, MeetingSummary } from '@shared/types';

interface UseTranscribeRecordingReturn {
  transcribe: (item: HistoryItem) => Promise<void>;
  isTranscribing: boolean;
  transcribingItemId: string | null;
}

export const useTranscribeRecording = (): UseTranscribeRecordingReturn => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingItemId, setTranscribingItemId] = useState<string | null>(null);
  const { categories, updateItem } = useHistoryData();
  const { settings, providers } = useSettings();
  const { setResult, setSelectedHistoryId, setStatus } = useAppActions();
  const { showToast } = useToast();

  const transcribe = useCallback(async (item: HistoryItem) => {
    if (!item.recordingFileName) {
      showToast('No recording file found for this item', 'error');
      return;
    }

    setIsTranscribing(true);
    setTranscribingItemId(item.id);

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
      const { result: data, usage } = await unifiedAIService.processAudio(
        audioBlob,
        categories,
        settings,
        providers,
        meetingContext
      );

      // Log transcription usage (fire-and-forget)
      const resolved = resolveModel(settings.analyzeModel || settings.chatModel, providers);
      logUsage({
        category: 'transcription',
        sessionId: item.id,
        provider: resolved?.provider,
        model: resolved?.modelId,
        usage,
      }).catch(e => console.error('[UsageLog] transcription:', e));

      // Build MeetingSummary from structured result
      const meetingSummary: MeetingSummary = {
        overview: data.structuredSummary?.overview || data.summary,
        keyDiscussionPoints: data.structuredSummary?.keyDiscussionPoints || [],
        decisionsMade: data.structuredSummary?.decisionsMade || [],
        actionItems: (data.structuredSummary?.actionItems || []).map(a => ({
          text: a.text,
          owner: a.owner,
          dueDate: a.dueDate,
        })),
        nextSteps: data.structuredSummary?.nextSteps || [],
      };

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

      showToast('Transcription complete', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to transcribe recording';
      console.error('[useTranscribeRecording] Error:', error);
      showToast(errorMessage, 'error');
    } finally {
      setIsTranscribing(false);
      setTranscribingItemId(null);
    }
  }, [categories, settings, providers, updateItem, setResult, setSelectedHistoryId, setStatus, showToast]);

  return { transcribe, isTranscribing, transcribingItemId };
};

export default useTranscribeRecording;
