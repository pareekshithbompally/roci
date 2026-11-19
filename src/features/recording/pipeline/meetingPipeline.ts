/** The one meeting pipeline: reads a meeting's status, runs the next step, saves, and advances it. */

import { invoke } from '@tauri-apps/api/core';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { unifiedAIService, transcribeAudio } from '@services/unifiedAIService';
import { formatTranscript, speechSelectionOf } from '@services/ai/transcription';
import { modelKey } from '@services/ai/models';
import { transcriptionService, meetingSummaryOf } from '@services/transcription.service';
import { IMPORT_CONFIG } from '@config/audio.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useAppStore } from '@shared/stores/appStore';
import { meetingProgress } from '@shared/stores/meetingProgressStore';
import { buildMeetingResult } from '@shared/hooks/useMeetingDetailLoader';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { errorMessage } from '@shared/utils/errors';
import type { AppSettings, MeetingDetail, MeetingIndexEntry, StoredTranscriptSegment } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingPipelineStage, MeetingStatus } from '@shared/types/meetingPhase';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import { liveTranscript, liveTranscriptResult, type LiveEntry } from '@features/recording/live';

/** What the steps need from the app, read when a run starts. */
export interface PipelineContext {
  settings: AppSettings;
  providers: ModelProvider[];
  categories: string[];
}

interface Transcript {
  text: string;
  segments?: StoredTranscriptSegment[];
}

let readContext: (() => PipelineContext) | null = null;
const running = new Map<string, AbortController>();

/** The step a meeting's status continues from; null when there is nothing to run. */
function nextStep(status: MeetingStatus): Exclude<MeetingPipelineStage, 'record'> | null {
  switch (status.status) {
    case 'captured':
    case 'transcribing':
    case 'ready':
      return 'transcribe';
    case 'transcribed':
    case 'summarizing':
      return 'summarize';
    case 'failed':
      return status.failedStep === 'record' ? null : status.failedStep ?? 'transcribe';
    default:
      return null;
  }
}

function refresh(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch((error: unknown) =>
    console.error('[meetingPipeline] Failed to refresh meetings:', error),
  );
}

async function setStatus(id: string, status: MeetingStatus): Promise<void> {
  await store.meetings.setStatus(id, status);
  refresh();
}

/** Shows the latest saved state when the meeting is the one on screen. */
async function refreshOpenMeeting(id: string): Promise<void> {
  const { selectedHistoryId, setResult } = useAppStore.getState();
  if (selectedHistoryId !== id) return;
  const detail = await store.meetings.get(id);
  if (detail && useAppStore.getState().selectedHistoryId === id) setResult(buildMeetingResult(detail));
}

/** Shows a meeting at once (placeholder, then disk): an opened recording must never face an empty results view. */
async function prime(id: string, title: string): Promise<void> {
  useAppStore.getState().setResult({ title, transcript: '', summary: '', categories: [] });
  try {
    const detail = await store.meetings.get(id);
    if (detail && useAppStore.getState().selectedHistoryId === id) {
      useAppStore.getState().setResult(buildMeetingResult(detail));
    }
  } catch (error: unknown) {
    console.error('[meetingPipeline] Prime failed:', id, error);
  }
}

async function loadRecording(fileName: string | undefined): Promise<Blob> {
  if (!fileName) throw new Error('This meeting has no recording to transcribe.');
  const loaded = await recordingsService.getRecordingData(fileName);
  if (!loaded.success || !loaded.data) throw new Error(loaded.error ?? 'Could not load the recording.');
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'wav';
  return new Blob([loaded.data], { type: IMPORT_CONFIG.audio.mimeTypes[extension] ?? 'audio/wav' });
}

/** Calendar attendees, so the summary can name speakers. */
function meetingContextOf(index: MeetingIndexEntry): MeetingContext | undefined {
  if (!index.scheduledStart || !index.participants?.length) return undefined;
  return {
    title: index.scheduledTitle || index.title,
    participants: index.participants.map((p) => ({ name: p.name, email: p.email })),
    scheduledStart: index.scheduledStart,
  };
}

async function transcribe(meeting: MeetingDetail, context: PipelineContext, signal: AbortSignal): Promise<Transcript> {
  const id = meeting.index.id;
  await setStatus(id, { status: 'transcribing' });
  const audio = await loadRecording(meeting.index.recordingFileName);
  const onProgress = (part: { current: number; total: number }) => meetingProgress.set(id, part);
  const result = await transcribeAudio(audio, context.settings, context.providers, { signal, onProgress }, id);
  const { formatted, segments } = formatTranscript(result);
  const selection = speechSelectionOf(context.settings);
  const model = selection ? modelKey(selection) : undefined;
  await transcriptionService.saveTranscript({ meetingId: id, text: formatted, segments, model });
  meetingProgress.clear(id);
  await refreshOpenMeeting(id);
  return { text: formatted, segments };
}

/** Saves the in-call transcript as the meeting's transcript (meeting → `transcribed`), labelled by who said each line. */
async function saveLiveTranscript(id: string, entries: LiveEntry[]): Promise<void> {
  const { formatted, segments } = formatTranscript(liveTranscriptResult(entries));
  const selection = readContext ? speechSelectionOf(readContext().settings) : null;
  await transcriptionService.saveTranscript({ meetingId: id, text: formatted, segments, model: selection ? modelKey(selection) : undefined });
  await refreshOpenMeeting(id);
}

function storedTranscript(meeting: MeetingDetail): Transcript {
  if (!meeting.transcript?.text) throw new Error('This meeting has no transcript to summarize.');
  return { text: meeting.transcript.text, segments: meeting.transcript.segments };
}

async function summarize(meeting: MeetingDetail, transcript: Transcript, context: PipelineContext, signal: AbortSignal): Promise<string> {
  const id = meeting.index.id;
  await setStatus(id, { status: 'summarizing' });
  const result = await unifiedAIService.processTranscript(
    transcript.text, transcript.segments, context.categories, context.settings, context.providers,
    { meetingContext: meetingContextOf(meeting.index), meetingId: id, signal },
  );
  const title = result.title || meeting.index.title;
  await transcriptionService.saveSummary({
    meetingId: id,
    title,
    summary: meetingSummaryOf(result),
    categories: result.categories ?? [],
  });
  await refreshOpenMeeting(id);
  return title;
}

async function process(id: string, context: PipelineContext, signal: AbortSignal): Promise<void> {
  const meeting = await store.meetings.get(id);
  const step = meeting ? nextStep(meeting.index.status) : null;
  if (!meeting || !step) return;
  const transcript = step === 'transcribe' ? await transcribe(meeting, context, signal) : storedTranscript(meeting);
  const title = await summarize(meeting, transcript, context, signal);
  notifyAppEvent({ id: `recording-ready:${id}`, kind: 'recordingReady', tone: 'success', inFront: 'quiet', title, body: 'Transcript and summary are ready.' });
}

/** After a failure or cancel: keep what was saved and record where it stopped. */
async function settle(id: string, error: unknown, cancelled: boolean): Promise<void> {
  const meeting = await store.meetings.get(id);
  if (!meeting) return;
  const atSummary = meeting.index.status.status === 'summarizing' || meeting.index.status.status === 'transcribed';
  if (cancelled) {
    await setStatus(id, { status: atSummary ? 'transcribed' : 'captured' });
    return;
  }
  const message = errorMessage(error) || 'Something went wrong';
  await setStatus(id, { status: 'failed', failedStep: atSummary ? 'summarize' : 'transcribe', error: message });
  notifyAppEvent({
    id: `recording-ready:${id}`,
    kind: 'recordingReady',
    tone: 'error',
    inFront: 'toast',
    title: atSummary ? "Couldn't summarize" : "Couldn't transcribe",
    body: message,
  });
}

async function runOne(id: string, context: PipelineContext): Promise<void> {
  const controller = new AbortController();
  running.set(id, controller);
  try {
    await process(id, context, controller.signal);
  } catch (error: unknown) {
    console.error('[meetingPipeline] Run failed:', id, error);
    await settle(id, error, controller.signal.aborted);
  } finally {
    meetingProgress.clear(id);
    running.delete(id);
  }
}

export const meetingPipeline = {
  /** Called by the runtime with a reader for the current settings, providers and categories. */
  configure(read: () => PipelineContext): void {
    readContext = read;
  },

  /** Runs a meeting from its current status to `ready`; a meeting already running is left alone. */
  run(id: string): Promise<void> {
    if (running.has(id)) return Promise.resolve();
    if (!readContext) return Promise.reject(new Error('The meeting pipeline is not ready yet.'));
    return runOne(id, readContext()).catch((error: unknown) =>
      console.error('[meetingPipeline] Could not record the outcome:', id, error),
    );
  },

  /** Stops a running meeting; it keeps what was saved and goes back to waiting. */
  cancel(id: string): void {
    running.get(id)?.abort();
  },

  /** The meeting's one action: cancel it while it runs, otherwise run it (Transcribe, Summarize, Retry). */
  toggle(id: string): void {
    if (running.has(id)) meetingPipeline.cancel(id);
    else void meetingPipeline.run(id);
  },

  /** Shows a meeting at once (placeholder, then disk); opening a recording uses this, never bare selection. */
  prime(id: string, title: string): Promise<void> {
    return prime(id, title);
  },

  /** A recording just stopped: its in-call transcript becomes the transcript when every chunk made it, else the recording
   *  is transcribed now (the in-call transcript was cut short) or when the user asked for that; then the summary follows. */
  recorded(id: string): void {
    void liveTranscript.finish(id)
      .then(async (live) => {
        if (live?.complete && live.entries.length > 0) await saveLiveTranscript(id, live.entries);
        if (live || readContext?.().settings.autoTranscribe) await meetingPipeline.run(id);
      })
      .catch((error: unknown) => console.error('[meetingPipeline] After recording:', id, error));
  },

  /** At launch: the recorder finishes recordings a quit or crash cut off; meetings left mid-pipeline resume. */
  async resume(): Promise<void> {
    if (!isTauriEnvironment()) return;
    const resumable = await invoke<string[]>('recover_meetings');
    refresh();
    for (const id of resumable) void meetingPipeline.run(id);
  },
};
