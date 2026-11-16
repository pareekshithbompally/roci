/** The live recording (one at a time): its meeting, clock and pause state. The meeting itself lives in the store. */

import { create } from 'zustand';
import type { AudioCaptureSource } from '@config/audio.config';
import { coreAudioService, isPermissionRefusal, captureErrorMessage } from '@services/coreAudio.service';
import { consumePendingCalendarMeta, type CalendarRecordingMeta } from '@services/calendar/recording-bridge';
import { isTauriEnvironment, menubarService } from '@services/tauri';
import { removeNotices } from '@services/notifications';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useAppStore } from '@shared/stores/appStore';
import { showToast } from '@shared/ui';
import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';

interface RecordingState {
  /** The meeting being recorded; null when idle. */
  meetingId: string | null;
  startedAt: number;
  /** When the current pause began; null while capturing. */
  pausedAt: number | null;
  /** Total time spent paused before the current pause. */
  pausedMs: number;
  /** True while Start or Stop is in flight. */
  busy: boolean;
  /** The recording that just stopped, offered in the tray with Transcribe until dismissed. */
  justStopped: string | null;
}

const IDLE: Pick<RecordingState, 'meetingId' | 'startedAt' | 'pausedAt' | 'pausedMs' | 'busy'> = {
  meetingId: null,
  startedAt: 0,
  pausedAt: null,
  pausedMs: 0,
  busy: false,
};

export const useRecordingStore = create<RecordingState>(() => ({ ...IDLE, justStopped: null }));

export const useRecordingMeetingId = () => useRecordingStore((s) => s.meetingId);
export const useRecordingPaused = () => useRecordingStore((s) => s.pausedAt !== null);
export const useRecordingBusy = () => useRecordingStore((s) => s.busy);
export const useJustStopped = () => useRecordingStore((s) => s.justStopped);

/** Seconds recorded so far, not counting pauses. */
export function recordedSeconds(state: RecordingState, now = Date.now()): number {
  const paused = state.pausedMs + (state.pausedAt !== null ? now - state.pausedAt : 0);
  return Math.max(0, Math.floor((now - state.startedAt - paused) / 1000));
}

function refreshMeetings(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch((error: unknown) =>
    console.error('[recordingStore] Failed to refresh meetings:', error),
  );
}

function syncMenubar(active: boolean, paused: boolean): void {
  void menubarService.setRecordingState(active, paused);
}

function titleFor(calendar: CalendarRecordingMeta | null, startedAt: number): string {
  return calendar?.scheduledTitle || `Recording ${new Date(startedAt).toLocaleString()}`;
}

function calendarMetaOf(calendar: CalendarRecordingMeta): Record<string, unknown> {
  const { calendarEventId: _id, ...meta } = calendar;
  return meta;
}

function reportStartFailure(error: unknown): void {
  if (isPermissionRefusal(error)) {
    useAppStore.getState().setPermissionChecklistOpen(true);
    return;
  }
  showToast(captureErrorMessage(error, 'Failed to start recording'), 'error');
}

export const recording = {
  /** Creates the meeting and starts capture; rejects (after telling the user) when it can't. */
  async start(source: AudioCaptureSource): Promise<string> {
    if (!isTauriEnvironment()) throw new Error('Native recording is available in the desktop app only.');
    if (useRecordingStore.getState().meetingId || useRecordingStore.getState().busy) {
      throw new Error('A recording is already running.');
    }
    // Taken with this start, so a refused start never hands it to a later recording.
    const calendar = consumePendingCalendarMeta();
    const startedAt = Date.now();
    useRecordingStore.setState({ busy: true });
    try {
      const meetingId = await coreAudioService.startCapture({
        source,
        title: titleFor(calendar, startedAt),
        calendarEventId: calendar?.calendarEventId,
        calendarMeta: calendar ? calendarMetaOf(calendar) : undefined,
      });
      useRecordingStore.setState({ ...IDLE, meetingId, startedAt });
      syncMenubar(true, false);
      refreshMeetings();
      return meetingId;
    } catch (error: unknown) {
      useRecordingStore.setState({ busy: false });
      reportStartFailure(error);
      throw error;
    }
  },

  /** Stops capture; the meeting is saved as "Not transcribed" (or transcribes now, per the setting). */
  async stop(): Promise<string | null> {
    if (!useRecordingStore.getState().meetingId) return null;
    useRecordingStore.setState({ busy: true });
    try {
      const meetingId = await coreAudioService.stopCapture();
      if (meetingId) {
        useRecordingStore.setState({ justStopped: meetingId });
        meetingPipeline.recorded(meetingId);
      }
      return meetingId;
    } catch (error: unknown) {
      showToast(captureErrorMessage(error, 'Failed to stop recording'), 'error');
      throw error;
    } finally {
      const { meetingId } = useRecordingStore.getState();
      if (meetingId) void removeNotices([`${NOTIFICATIONS_CONFIG.recording.idPrefix}${meetingId}`]);
      useRecordingStore.setState(IDLE);
      syncMenubar(false, false);
      refreshMeetings();
    }
  },

  async pause(): Promise<void> {
    await coreAudioService.pauseCapture();
    useRecordingStore.setState((s) => (s.pausedAt === null ? { pausedAt: Date.now() } : s));
    syncMenubar(true, true);
  },

  async resume(): Promise<void> {
    await coreAudioService.resumeCapture();
    useRecordingStore.setState((s) =>
      s.pausedAt === null ? s : { pausedMs: s.pausedMs + Date.now() - s.pausedAt, pausedAt: null },
    );
    syncMenubar(true, false);
  },

  /** Clears the tray's "just stopped" row. */
  dismissStopped(): void {
    useRecordingStore.setState({ justStopped: null });
  },
};
