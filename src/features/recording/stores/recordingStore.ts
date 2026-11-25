/**
 * The live recording (one at a time), mirrored from the recorder. The recorder is the only source of truth:
 * every control asks it to act and then reads its state back, and a reload reads it on mount.
 */

import { create } from 'zustand';
import { formatDateTime } from '@shared/utils/formatters';
import type { AudioCaptureSource } from '@config/audio.config';
import { coreAudioService, isPermissionRefusal, captureErrorMessage } from '@services/coreAudio.service';
import type { RecorderState } from '@services/coreAudio.service';
import { consumePendingCalendarMeta, type CalendarRecordingMeta } from '@services/calendar/recording-bridge';
import { isTauriEnvironment, menubarService } from '@services/tauri';
import { removeNotices } from '@services/notifications';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { useAppStore } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { showToast } from '@shared/ui';
import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';
import { haptic } from '@platform/haptics';

interface RecordingState {
  /** The meeting being recorded; null when idle. */
  meetingId: string | null;
  /** Time recorded when the recorder was last read, pauses excluded. */
  recordedMs: number;
  /** When the recorder was last read; the clock runs on from here unless paused. */
  readAt: number;
  paused: boolean;
  /** The in-call audio comes as frames for a streaming speech model (chosen at Record; the recorder reports it). */
  liveStreaming: boolean;
  /** True while Start or Stop is in flight. */
  busy: boolean;
  /** The recording that just stopped, offered in the tray with Transcribe until dismissed. */
  justStopped: string | null;
}

type Mirror = Pick<RecordingState, 'meetingId' | 'recordedMs' | 'readAt' | 'paused' | 'liveStreaming'>;

export const useRecordingStore = create<RecordingState>(() => ({
  meetingId: null,
  recordedMs: 0,
  readAt: 0,
  paused: false,
  liveStreaming: false,
  busy: false,
  justStopped: null,
}));

export const useRecordingMeetingId = () => useRecordingStore((s) => s.meetingId);
export const useRecordingPaused = () => useRecordingStore((s) => s.paused);
export const useRecordingBusy = () => useRecordingStore((s) => s.busy);
export const useJustStopped = () => useRecordingStore((s) => s.justStopped);

/** The store's copy of the recorder's state, read at `now`. */
export function mirrorOf(recorder: RecorderState, now: number): Mirror {
  if (recorder.state === 'idle') return { meetingId: null, recordedMs: 0, readAt: now, paused: false, liveStreaming: false };
  return { meetingId: recorder.meetingId, recordedMs: recorder.recordedMs, readAt: now, paused: recorder.paused, liveStreaming: recorder.liveStreaming };
}

/** Seconds recorded so far, not counting pauses. */
export function recordedSeconds(state: Mirror, now = Date.now()): number {
  const running = state.meetingId !== null && !state.paused;
  const sinceRead = running ? now - state.readAt : 0;
  return Math.max(0, Math.floor((state.recordedMs + sinceRead) / 1000));
}

/** Reads the recorder into the store and the menu bar; a failed read is logged and leaves both as they were. */
async function sync(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const recorder = await coreAudioService.recorderState();
    const mirror = mirrorOf(recorder, Date.now());
    useRecordingStore.setState(mirror);
    void menubarService.setRecordingState(mirror.meetingId !== null, mirror.paused);
  } catch (error: unknown) {
    console.error('[recordingStore] Failed to read the recorder:', error);
  }
}

function titleFor(calendar: CalendarRecordingMeta | null, startedAt: number): string {
  return calendar?.scheduledTitle || `Recording ${formatDateTime(startedAt)}`;
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
  /** Mirrors the recorder; called on mount, so a reload picks up a recording that is still running. */
  sync,

  /** Creates the meeting and starts capture; rejects (after telling the user) when it can't. */
  /** `liveStreaming`: the chosen speech model streams, so the recorder sends its in-call audio as frames. */
  async start(source: AudioCaptureSource, liveStreaming = false): Promise<string> {
    if (!isTauriEnvironment()) throw new Error('Native recording is available in the desktop app only.');
    if (useRecordingStore.getState().meetingId || useRecordingStore.getState().busy) {
      throw new Error('A recording is already running.');
    }
    // Taken with this start, so a refused start never hands it to a later recording.
    const calendar = consumePendingCalendarMeta();
    useRecordingStore.setState({ busy: true });
    try {
      const title = titleFor(calendar, Date.now());
      const meetingId = await coreAudioService.startCapture({
        source,
        title,
        calendarEventId: calendar?.calendarEventId,
        calendarMeta: calendar ? calendarMetaOf(calendar) : undefined,
        liveStreaming,
      });
      haptic('pressed');
      useAppStore.getState().setSelectedHistoryId(meetingId);
      useAppStore.getState().setActiveResultTab('transcript');
      useAppStore.getState().setStatus(AppStatus.RESULTS);
      return meetingId;
    } catch (error: unknown) {
      reportStartFailure(error);
      throw error;
    } finally {
      await sync();
      useRecordingStore.setState({ busy: false });
    }
  },

  /** Stops capture; the meeting is transcribed and summarized (per the settings), or with `later` keeps only its live transcript. */
  async stop(later = false): Promise<string | null> {
    const { meetingId: recordingId } = useRecordingStore.getState();
    useRecordingStore.setState({ busy: true });
    try {
      const meetingId = await coreAudioService.stopCapture();
      if (meetingId) {
        haptic('landed');
        useRecordingStore.setState({ justStopped: meetingId });
        useAppStore.getState().setSelectedHistoryId(meetingId);
        useAppStore.getState().setActiveResultTab('transcript');
        useAppStore.getState().setStatus(AppStatus.RESULTS);
        meetingPipeline.recorded(meetingId, later);
      }
      return meetingId;
    } catch (error: unknown) {
      showToast(captureErrorMessage(error, 'Failed to stop recording'), 'error');
      throw error;
    } finally {
      if (recordingId) void removeNotices([`${NOTIFICATIONS_CONFIG.recording.idPrefix}${recordingId}`]);
      await sync();
      useRecordingStore.setState({ busy: false });
    }
  },

  async pause(): Promise<void> {
    try {
      await coreAudioService.pauseCapture();
    } catch (error: unknown) {
      showToast(captureErrorMessage(error, 'Failed to pause recording'), 'error');
    }
    await sync();
  },

  /** iPhone: refused when the audio session can't be taken back (e.g. a call still holds it). */
  async resume(): Promise<void> {
    try {
      await coreAudioService.resumeCapture();
    } catch (error: unknown) {
      showToast(captureErrorMessage(error, 'Failed to resume recording'), 'error');
    }
    await sync();
  },

  /** Clears the tray's "just stopped" row. */
  dismissStopped(): void {
    useRecordingStore.setState({ justStopped: null });
  },
};
