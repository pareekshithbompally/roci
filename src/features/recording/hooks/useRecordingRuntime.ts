/** Mount once (App): wires the meeting pipeline to the app, resumes unfinished meetings, and mirrors both into the tray. */

import { useEffect, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { activityStore, type ActivityAction, type ActivityItem } from '@shared/stores/activityStore';
import { useMeetingParts } from '@shared/stores/meetingProgressStore';
import type { HistoryItem } from '@shared/types';
import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';
import {
  recording,
  recordedSeconds,
  useJustStopped,
  useRecordingBusy,
  useRecordingMeetingId,
  useRecordingPaused,
  useRecordingStore,
} from '@features/recording/stores/recordingStore';
import { checkStillRecording, listenForStillRecordingAnswers } from '@features/recording/stillRecording';

const RECORDING_ROW = 'recording';
const SAVED_ROW = 'recording:saved';
const MEETING_ROW_PREFIX = 'meeting:';
const TICK_MS = 1000;

const ROW_DEFAULTS = { percent: null, step: null, detail: null, error: null, actions: [] } satisfies Partial<ActivityItem>;

function put(item: ActivityItem): void {
  if (activityStore.get(item.id)) activityStore.update(item.id, item);
  else activityStore.add(item);
}

function clock(seconds: number): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function recordingActions(paused: boolean, busy: boolean): ActivityAction[] {
  if (busy) return [];
  const toggle: ActivityAction = paused
    ? { icon: 'play', label: 'Resume', onClick: () => void recording.resume() }
    : { icon: 'pause', label: 'Pause', onClick: () => void recording.pause() };
  return [toggle, { icon: 'square', label: 'Stop', onClick: () => void recording.stop() }];
}

/** Reads the current settings, providers and categories into the pipeline; resumes once the store is open. */
function usePipelineContext(): void {
  const { settings, providers, isLoading } = useSettings();
  const { categories } = useHistoryData();
  const context = useRef({ settings, providers, categories });
  context.current = { settings, providers, categories };

  useEffect(() => meetingPipeline.configure(() => context.current), []);

  const resumed = useRef(false);
  useEffect(() => {
    if (isLoading || resumed.current) return;
    resumed.current = true;
    meetingPipeline.resume().catch((error: unknown) => console.error('[useRecordingRuntime] Resume failed:', error));
  }, [isLoading]);
}

/** The live recording row: clock, pause/resume, stop; also drives the hourly "still recording?" ask. */
function useRecordingRow(): void {
  const meetingId = useRecordingMeetingId();
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();

  useEffect(() => {
    if (!meetingId) {
      activityStore.remove(RECORDING_ROW);
      return;
    }
    const render = () => {
      const seconds = recordedSeconds(useRecordingStore.getState());
      const label = busy ? 'Stopping…' : paused ? 'Paused' : 'Recording';
      put({ ...ROW_DEFAULTS, id: RECORDING_ROW, type: 'recording', status: 'active', label, detail: clock(seconds), actions: recordingActions(paused, busy) });
      if (!paused && !busy) checkStillRecording(meetingId, seconds);
    };
    render();
    const timer = setInterval(render, TICK_MS);
    return () => clearInterval(timer);
  }, [meetingId, paused, busy]);

  useEffect(() => listenForStillRecordingAnswers(), []);
}

/** The recording that just stopped, with Transcribe, until it is transcribed or dismissed. */
function useSavedRow(items: HistoryItem[]): void {
  const justStopped = useJustStopped();

  useEffect(() => {
    const meeting = justStopped ? items.find((item) => item.id === justStopped) : undefined;
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
    put({ ...ROW_DEFAULTS, id: SAVED_ROW, type: 'recording', status: 'active', label: 'Saved · Not transcribed', detail: meeting.title, actions: [transcribe, dismiss] });
  }, [justStopped, items]);
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

/** One row per meeting transcribing or summarizing, and per one that failed while this session ran it. */
function useMeetingRows(items: HistoryItem[]): void {
  const parts = useMeetingParts();
  const ranThisSession = useRef(new Set<string>());

  useEffect(() => {
    const shown = new Set<string>();
    for (const meeting of items) {
      const name = meeting.status?.status;
      const busy = name === 'transcribing' || name === 'summarizing';
      if (busy) ranThisSession.current.add(meeting.id);
      if (!busy && !(name === 'failed' && ranThisSession.current.has(meeting.id))) continue;
      const row = meetingRow(meeting, parts[meeting.id] ?? null);
      shown.add(row.id);
      put(row);
    }
    for (const item of activityStore.getSnapshot()) {
      if (item.id.startsWith(MEETING_ROW_PREFIX) && !shown.has(item.id)) activityStore.remove(item.id);
    }
  }, [items, parts]);
}

export function useRecordingRuntime(): void {
  const { items } = useHistoryData();
  usePipelineContext();
  useRecordingRow();
  useSavedRow(items);
  useMeetingRows(items);
}
