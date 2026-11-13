/**
 * useRecordingRecovery
 *
 * Once at launch, adds recordings a quit or crash left unfinished to History:
 * the backend mixes their tracks down, and each is saved like any finished
 * recording. One recording failing to save never skips the others.
 */

import { useEffect, useRef } from 'react';
import { coreAudioService } from '@services/coreAudio.service';
import { isTauriEnvironment } from '@services/tauri';
import { StorageConfig, getRecordingIdFromFilename } from '@config/storage.config';
import type { HistoryEntry } from '@features/recording/types';

type ShowToast = (message: string, type: 'success' | 'warning') => void;

async function recoverIntoHistory(
  saveToHistory: (entry: HistoryEntry) => Promise<void>,
  showToast: ShowToast,
): Promise<void> {
  const recovered = await coreAudioService.recoverRecordings(StorageConfig.directories.recordings);
  let saved = 0;
  for (const recording of recovered) {
    try {
      await saveToHistory({
        recordingId: getRecordingIdFromFilename(recording.fileName),
        filename: recording.fileName,
        duration: recording.durationSecs,
        size: recording.size,
        source: recording.source,
        recordedAt: recording.recordedAtMs,
      });
      saved += 1;
    } catch (error) {
      console.error('[useRecordingRecovery] Could not save recovered recording:', recording.fileName, error);
    }
  }
  if (saved > 0) {
    showToast(`Recovered ${saved} unfinished recording${saved > 1 ? 's' : ''} — see History`, 'success');
  }
  if (saved < recovered.length) {
    showToast('Some recovered recordings could not be added to History', 'warning');
  }
}

/** Runs recovery once, when `ready` (history can be written). */
export function useRecordingRecovery(
  ready: boolean,
  saveToHistory: (entry: HistoryEntry) => Promise<void>,
  showToast: ShowToast,
): void {
  const started = useRef(false);
  useEffect(() => {
    if (!isTauriEnvironment() || !ready || started.current) return;
    started.current = true;
    recoverIntoHistory(saveToHistory, showToast).catch((error: unknown) =>
      console.error('[useRecordingRecovery] Recording recovery failed:', error),
    );
  }, [ready, saveToHistory, showToast]);
}
