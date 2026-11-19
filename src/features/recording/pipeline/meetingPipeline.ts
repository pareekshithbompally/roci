/** The one meeting pipeline: each step (transcribe, summarize) runs under the store's guard — begun there (refused when the
 *  meeting already runs one), its result saved, and ended done, cancelled or failed. The store owns the status and announces
 *  every change (`meeting://changed`), so nothing here writes a status or refreshes a screen. */

import { invoke } from '@tauri-apps/api/core';
import { store } from '@services/db';
import { recordingsService } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { unifiedAIService, transcribeAudio } from '@services/unifiedAIService';
import { formatTranscript, speechSelectionOf } from '@services/ai/transcription';
import { modelKey } from '@services/ai/models';
import { transcriptionService } from '@services/transcription.service';
import { IMPORT_CONFIG } from '@config/audio.config';
import { useAppStore } from '@shared/stores/appStore';
import { meetingProgress } from '@shared/stores/meetingProgressStore';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { errorMessage } from '@shared/utils/errors';
import type { AppSettings, MeetingDetail, MeetingIndexEntry, StoredTranscriptSegment } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingStatus, MeetingStep } from '@shared/types/meetingPhase';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import { liveTranscript } from '@features/recording/live';

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
/** The steps this window runs, by meeting, so Cancel can stop them; the store's guard is what keeps runs from racing. */
const running = new Map<string, AbortController>();

/** A step's work: produce its result and save it (the save moves the meeting on). */
type StepWork = (signal: AbortSignal) => Promise<void>;

/** The step a meeting's status continues from; null when there is nothing to run. */
function nextStep(status: MeetingStatus): MeetingStep | null {
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

async function loadRecording(fileName: string | undefined): Promise<Blob> {
  if (!fileName) throw new Error('This meeting has no recording to transcribe.');
  const loaded = await recordingsService.getRecordingData(fileName);
  // the reason is logged by the recordings service; the meeting shows what to do
  if (!loaded.success || !loaded.data) throw new Error("Couldn't read this meeting's recording file. Try again.");
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

async function meetingOrThrow(id: string): Promise<MeetingDetail> {
  const meeting = await store.meetings.get(id);
  if (!meeting) throw new Error('This meeting no longer exists.');
  return meeting;
}

function speechModelOf(context: PipelineContext): string | undefined {
  const selection = speechSelectionOf(context.settings);
  return selection ? modelKey(selection) : undefined;
}

/** Transcribes the recording and saves the transcript. */
const transcribeRecording = (id: string, context: PipelineContext): StepWork => async (signal) => {
  const meeting = await meetingOrThrow(id);
  const audio = await loadRecording(meeting.index.recordingFileName);
  const onProgress = (part: { current: number; total: number }) => meetingProgress.set(id, part);
  const result = await transcribeAudio(audio, context.settings, context.providers, { signal, onProgress, meetingId: id });
  const { formatted, segments } = formatTranscript(result);
  await transcriptionService.saveTranscript({ meetingId: id, text: formatted, segments, model: speechModelOf(context) });
};

/** Just after Stop: the in-call transcript ends (it stays on screen as the draft) and the whole recording is transcribed — as
 *  Hex does, the final transcript always comes from the full recording, with every word in its context. */
const transcribeAfterRecording = (id: string, context: PipelineContext): StepWork => (signal) => {
  liveTranscript.finish(id);
  return transcribeRecording(id, context)(signal);
};

function storedTranscript(meeting: MeetingDetail): Transcript {
  if (!meeting.transcript?.text) throw new Error('This meeting has no transcript to summarize.');
  return { text: meeting.transcript.text, segments: meeting.transcript.segments };
}

/** Writes the summary and saves it with its title (the store keeps a calendar or user title), categories and action items. */
const summarizeTranscript = (id: string, context: PipelineContext): StepWork => async (signal) => {
  const meeting = await meetingOrThrow(id);
  const transcript = storedTranscript(meeting);
  const analysis = await unifiedAIService.processTranscript(
    transcript.text, context.categories, context.settings, context.providers,
    { meetingContext: meetingContextOf(meeting.index), meetingId: id, signal },
  );
  await transcriptionService.saveSummary({ meetingId: id, ...analysis });
};

const FAILED_TITLE: Record<MeetingStep, string> = { transcribe: "Couldn't transcribe", summarize: "Couldn't summarize" };

function announceFailure(id: string, step: MeetingStep, message: string): void {
  notifyAppEvent({
    id: `recording-ready:${id}`,
    kind: 'recordingReady',
    tone: 'error',
    // the open meeting already says it under its title
    inFront: useAppStore.getState().selectedHistoryId === id ? 'quiet' : 'toast',
    title: FAILED_TITLE[step],
    body: message,
  });
}

async function announceReady(id: string): Promise<void> {
  const meeting = await store.meetings.get(id);
  const title = meeting?.index.title ?? 'Meeting';
  notifyAppEvent({ id: `recording-ready:${id}`, kind: 'recordingReady', tone: 'success', inFront: 'quiet', title, body: 'Transcript and summary are ready.' });
}

/** Records how a step ended; a store that can't be written is logged (the meeting resumes at the next launch). */
async function endStep(id: string, step: MeetingStep, end: Parameters<typeof store.meetings.endStep>[2]): Promise<void> {
  await store.meetings.endStep(id, step, end).catch((error: unknown) => console.error('[meetingPipeline] Ending the step failed:', id, step, error));
}

/** Runs one step under the store's guard; true when it finished. Refused (another run has it) → false, nothing touched. */
async function runStep(id: string, step: MeetingStep, work: StepWork): Promise<boolean> {
  if (!(await store.meetings.beginStep(id, step))) return false;
  const controller = new AbortController();
  running.set(id, controller);
  try {
    await work(controller.signal);
    await endStep(id, step, { kind: 'done' });
    return true;
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      await endStep(id, step, { kind: 'cancelled' });
      return false;
    }
    const message = errorMessage(error) || 'Something went wrong';
    console.error('[meetingPipeline] Step failed:', id, step, error);
    await endStep(id, step, { kind: 'failed', error: message });
    announceFailure(id, step, message);
    return false;
  } finally {
    running.delete(id);
    meetingProgress.clear(id);
  }
}

/** Runs a meeting from `first` to ready: transcribe (with `transcription`'s work), then summarize. */
async function runFrom(id: string, first: MeetingStep, context: PipelineContext, transcription: StepWork): Promise<void> {
  if (first === 'transcribe' && !(await runStep(id, 'transcribe', transcription))) return;
  if (await runStep(id, 'summarize', summarizeTranscript(id, context))) await announceReady(id);
}

async function runMeeting(id: string, context: PipelineContext): Promise<void> {
  const meeting = await store.meetings.get(id);
  const step = meeting ? nextStep(meeting.index.status) : null;
  if (step) await runFrom(id, step, context, transcribeRecording(id, context));
}

function contextOrThrow(): PipelineContext {
  if (!readContext) throw new Error('The meeting pipeline is not ready yet.');
  return readContext();
}

const report = (what: string, id: string) => (error: unknown) => console.error(`[meetingPipeline] ${what}:`, id, error);

export const meetingPipeline = {
  /** Called by the runtime with a reader for the current settings, providers and categories. */
  configure(read: () => PipelineContext): void {
    readContext = read;
  },

  /** Runs a meeting from its status to ready (Transcribe, Summarize, Retry, Re-transcribe). */
  run(id: string): Promise<void> {
    return Promise.resolve().then(() => runMeeting(id, contextOrThrow())).catch(report('Run failed', id));
  },

  /** Stops a meeting's running step; what was saved stays, and the meeting waits for that step again. */
  cancel(id: string): void {
    running.get(id)?.abort();
  },

  /** The meeting's one action: cancel it while it runs, otherwise run it. */
  toggle(id: string): void {
    if (running.has(id)) meetingPipeline.cancel(id);
    else void meetingPipeline.run(id);
  },

  /** A recording just stopped. With an in-call transcript the meeting reads as transcribing at once (its draft stays on
   *  screen) and the whole recording is transcribed; without one it is transcribed only when the user asked for that. Then the
   *  summary follows. */
  recorded(id: string): void {
    const live = liveTranscript.active(id);
    if (!live && !readContext?.().settings.autoTranscribe) return;
    void Promise.resolve()
      .then(() => {
        const context = contextOrThrow();
        return runFrom(id, 'transcribe', context, live ? transcribeAfterRecording(id, context) : transcribeRecording(id, context));
      })
      .catch(report('After recording', id));
  },

  /** At launch: the recorder finishes recordings a quit or crash cut off; meetings a quit left mid-step run that step again
   *  (the store stops offering one that was cut off twice). */
  async resume(): Promise<void> {
    if (!isTauriEnvironment()) return;
    const resumable = await invoke<string[]>('recover_meetings');
    for (const id of resumable) void meetingPipeline.run(id);
  },
};
