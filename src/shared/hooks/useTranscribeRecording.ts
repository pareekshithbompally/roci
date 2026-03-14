/**
 * useTranscribeRecording Hook
 *
 * Encapsulates the flow: load recording blob -> processAudio -> update history item.
 * Used by sidebar (Transcribe/Re-transcribe) and potentially ResultsView.
 */

import { useState, useCallback } from 'react';
import { recordingsService, transcriptionsService, summariesService } from '@/services/storage';
import { unifiedAIService } from '@/services/unifiedAIService';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useApp } from '@shared/contexts/AppContext';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@/services/tauri';
import type { HistoryItem } from '@/types';

interface UseTranscribeRecordingReturn {
  transcribe: (item: HistoryItem) => Promise<void>;
  isTranscribing: boolean;
  transcribingItemId: string | null;
}

export const useTranscribeRecording = (): UseTranscribeRecordingReturn => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingItemId, setTranscribingItemId] = useState<string | null>(null);
  const { updateItem, categories } = useHistory();
  const { settings, providers } = useSettings();
  const { setResult, setSelectedHistoryId, setStatus } = useApp();
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

      // Process with unified AI service
      const data = await unifiedAIService.processAudio(
        audioBlob,
        categories,
        settings,
        providers
      );

      // Save transcription and summary to storage
      let transcriptionId: string | undefined;
      let summaryId: string | undefined;
      const recordingId = item.recordingId || item.id;

      if (isTauriEnvironment()) {
        const transcriptionResult = await transcriptionsService.saveTranscription(
          recordingId,
          data.transcript,
          { model: settings.transcriptionModel }
        );
        transcriptionId = transcriptionResult.data?.id;

        const summaryResult = await summariesService.saveSummary(
          recordingId,
          transcriptionId || recordingId,
          data.summary,
          data.categories,
          {
            model: settings.transcriptionModel,
            categories: data.categories,
          }
        );
        summaryId = summaryResult.data?.id;

        // Update recording metadata
        await recordingsService.updateRecordingMetadata(item.recordingFileName, {
          transcriptionId,
          summaryId,
        });
      }

      // Update history item in-place
      await updateItem(item.id, {
        title: data.title || item.title,
        transcript: data.transcript,
        summary: data.summary,
        categories: data.categories,
        structuredSummary: data.structuredSummary,
        transcriptionId,
        summaryId,
        pendingTranscription: false,
      });

      // Show results
      setResult(data);
      setSelectedHistoryId(item.id);
      setStatus('RESULTS' as any);

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
