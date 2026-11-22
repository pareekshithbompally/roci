/** Mount once (App): wires the meeting pipeline to the app, resumes unfinished meetings, and mirrors both into the tray. */

import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri';
import { RECORDING_EVENTS } from '@config/audio.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useMeetingBrief, useMeetingBriefs, useMeetingsFound } from '@shared/hooks/useMeetings';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { BUSY_MEETINGS_SHOWN } from '@config/meetingPhase.config';
import { activityStore, type ActivityAction, type ActivityItem } from '@shared/stores/activityStore';
import { useMeetingParts } from '@shared/stores/meetingProgressStore';
import type { HistoryItem } from '@shared/types';
import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';
import { followMeetingChanges } from '@features/recording/pipeline/meetingChanges';
import {
  recording,
  recordedSeconds,
  useJustStopped,
  useRecordingBusy,
  useRecordingMeetingId,
  useRecordingPaused,
  useRecordingStore,
} from '@features/recording/stores/recordingStore';
import { checkStillRecording, listenForStillRecordingAnswers, nextStillRecordingCheckAt } from '@features/recording/stillRecording';
import { useDocumentVisible } from '@shared/hooks';
import { formatClock } from '@shared/utils/formatters';
import { useAIReadiness } from '@features/settings';
import { platform } from '@platform/index';
import { useMeetingLive } from '@features/recording/live/useMeetingLive';

const RECORDING_ROW = 'recording';
const SAVED_ROW = 'recording:saved';
const MEETING_ROW_PREFIX = 'meeting:';
const TICK_MS = 1000;

const ROW_DEFAULTS = { percent: null, step: null, detail: null, error: null, actions: [] } satisfies Partial<ActivityItem>;

function put(item: ActivityItem): void {
  if (activityStore.get(item.id)) activityStore.update(item.id, item);
  else activityStore.add(item);
}

/** The record screen's controls, in its order: Pause or Resume, Save for Later once paused, Stop. */
function recordingActions(paused: boolean, busy: boolean): ActivityAction[] {
  if (busy) return [];
  const stop: ActivityAction = { icon: 'square', label: LIVE.copy.stop, onClick: () => void recording.stop() };
  if (!paused) return [{ icon: 'pause', label: LIVE.copy.pause, onClick: () => void recording.pause() }, stop];
  return [
    { icon: 'play', label: LIVE.copy.resume, onClick: () => void recording.resume() },
    { icon: 'clock', label: LIVE.copy.saveForLater, onClick: () => void recording.stop(true) },
    stop,
  ];
}

/** Reads the current settings, providers and categories into the pipeline; resumes once the store is open. */
function usePipelineContext(): void {
  const { settings, providers, isLoading } = useSettings();
  const categories = [...TRANSCRIPTION_CONFIG.categories];
  const context = useRef({ settings, providers, categories });
  context.current = { settings, providers, categories };

  useEffect(() => meetingPipeline.configure(() => context.current), []);

  // every meeting write the store commits reaches the screens through this one event
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const unlisten = followMeetingChanges();
    return () => void unlisten.then((stop) => stop()).catch((error: unknown) => console.error('[useRecordingRuntime] Unlisten failed:', error));
  }, []);

  const resumed = useRef(false);
  useEffect(() => {
    if (!platform.canRecord || isLoading || resumed.current) return;
    resumed.current = true;
    meetingPipeline.resume().catch((error: unknown) => console.error('[useRecordingRuntime] Resume failed:', error));
  }, [isLoading]);
}

/** The live recording row: clock, pause/resume, stop; also drives the hourly "still recording?" ask. Reads the recorder on mount. */
function useRecordingRow(): void {
  const meetingId = useRecordingMeetingId();
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();
  const visible = useDocumentVisible();

  // The recorder outlives the page: after a reload, pick up a recording that is still running;
  // and when it changes by itself (an iPhone call pauses or resumes it), read it again.
  useEffect(() => {
    if (!platform.canRecord) return;
    void recording.sync();
    if (!isTauriEnvironment()) return;
    const unlisten = listen(RECORDING_EVENTS.recorderChanged, () => void recording.sync());
    return () => void unlisten.then((stop) => stop()).catch((error: unknown) => console.error('[useRecordingRuntime] Unlisten failed:', error));
  }, []);

  useEffect(() => {
    if (!meetingId) {
      activityStore.remove(RECORDING_ROW);
      return;
    }
    const render = () => {
      const seconds = recordedSeconds(useRecordingStore.getState());
      const label = busy ? 'Stopping…' : paused ? 'Paused' : 'Recording';
      put({ ...ROW_DEFAULTS, id: RECORDING_ROW, type: 'recording', status: 'active', label, detail: formatClock(seconds), actions: recordingActions(paused, busy) });
    };
    render();
    // A visible clock: ticks only while running and on screen; hidden, paused or stopping shows a still frame.
    if (paused || busy || !visible) return;
    const timer = setInterval(render, TICK_MS);
    return () => clearInterval(timer);
  }, [meetingId, paused, busy, visible]);

  // The "still recording?" ask: one timer armed for its next deadline, on screen or not.
  useEffect(() => {
    if (!meetingId || paused || busy) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const seconds = recordedSeconds(useRecordingStore.getState());
      timer = setTimeout(() => {
        checkStillRecording(meetingId, recordedSeconds(useRecordingStore.getState()));
        arm();
      }, Math.max(0, nextStillRecordingCheckAt(meetingId) - seconds) * TICK_MS);
    };
    arm();
    return () => clearTimeout(timer);
  }, [meetingId, paused, busy]);

  useEffect(() => listenForStillRecordingAnswers(), []);
}

/** The recording that just stopped, with Transcribe (once a speech engine is set up), until it is transcribed or dismissed. */
function useSavedRow(): void {
  const justStopped = useJustStopped();
  const meeting = useMeetingBrief(justStopped);
  const canTranscribe = useAIReadiness().speech;

  useEffect(() => {
    const status = meeting?.status;
    if (!meeting || !status || (status.status !== 'captured' && status.failedStep !== 'record')) {
      activityStore.remove(SAVED_ROW);
      return;
    }
    const dismiss: ActivityAction = { icon: 'x', label: 'Dismiss', onClick: recording.dismissStopped };
    if (status.status === 'failed') {
      put({ ...ROW_DEFAULTS, id: SAVED_ROW, type: 'processing', status: 'error', label: "Couldn't save the recording", error: status.error ?? null, actions: [dismiss] });
      return;
    }
    const transcribe: ActivityAction = {
      icon: 'sparkles',
      label: 'Transcribe',
      onClick: () => {
        recording.dismissStopped();
        void meetingPipeline.run(meeting.id);
      },
    };
    put({ ...ROW_DEFAULTS, id: SAVED_ROW, type: 'recording', status: 'active', label: 'Saved · Not transcribed', detail: meeting.title, actions: canTranscribe ? [transcribe, dismiss] : [dismiss] });
  }, [meeting, canTranscribe]);
}

function meetingRow(meeting: HistoryItem, part: ActivityItem['step']): ActivityItem {
  const id = `${MEETING_ROW_PREFIX}${meeting.id}`;
  const status = meeting.status;
  if (status?.status === 'failed') {
    const retry: ActivityAction = { icon: 'refresh-cw', label: 'Retry', onClick: () => void meetingPipeline.run(meeting.id) };
    const label = status.failedStep === 'summarize' ? "Couldn't summarize" : "Couldn't transcribe";
    return { ...ROW_DEFAULTS, id, type: 'processing', status: 'error', label, detail: meeting.title, error: status.error ?? null, actions: [retry] };
  }
  const label = status?.status === 'summarizing' ? 'Summarizing…' : 'Transcribing…';
  const cancel: ActivityAction = { icon: 'x', label: 'Cancel', onClick: () => meetingPipeline.cancel(meeting.id) };
  return { ...ROW_DEFAULTS, id, type: 'processing', status: 'active', label, step: part, detail: meeting.title, actions: [cancel] };
}

const BUSY = ['transcribing', 'summarizing'];

/** One row per meeting transcribing or summarizing (read from the store by status), and per one that failed while this
 *  session ran it (read by id). */
function useMeetingRows(): void {
  const parts = useMeetingParts();
  const busy = useMeetingsFound({ statuses: BUSY }, BUSY_MEETINGS_SHOWN);
  const [ran, setRan] = useState<string[]>([]);
  useEffect(() => {
    const started = busy.map((m) => m.id).filter((id) => !ran.includes(id));
    if (started.length > 0) setRan((prev) => [...prev, ...started]);
  }, [busy, ran]);
  const ranMeetings = useMeetingBriefs(ran);

  useEffect(() => {
    const shown = new Set<string>();
    const failed = ranMeetings.filter((m) => m.status?.status === 'failed');
    for (const meeting of [...busy, ...failed]) {
      const row = meetingRow(meeting, parts[meeting.id] ?? null);
      shown.add(row.id);
      put(row);
    }
    for (const item of activityStore.getSnapshot()) {
      if (item.id.startsWith(MEETING_ROW_PREFIX) && !shown.has(item.id)) activityStore.remove(item.id);
    }
  }, [busy, ranMeetings, parts]);
}

export function useRecordingRuntime(): void {
  usePipelineContext();
  useRecordingRow();
  useSavedRow();
  useMeetingRows();
  useMeetingLive();
}
