import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MeetingStatus, MeetingStep, MeetingStepEnd } from '@shared/types/meetingPhase';

const db = vi.hoisted(() => ({ get: vi.fn(), beginStep: vi.fn(), endStep: vi.fn() }));
const saves = vi.hoisted(() => ({ saveTranscript: vi.fn(), saveSummary: vi.fn() }));
const ai = vi.hoisted(() => ({ transcribeAudio: vi.fn(), processTranscript: vi.fn() }));

vi.mock('@services/db', () => ({ store: { meetings: db } }));
vi.mock('@services/storage', () => ({
  recordingsService: { getRecordingData: vi.fn(async () => ({ success: true, data: new Uint8Array([1]) })) },
}));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => false }));
vi.mock('@services/unifiedAIService', () => ({
  transcribeAudio: ai.transcribeAudio,
  unifiedAIService: { processTranscript: ai.processTranscript },
}));
vi.mock('@services/transcription.service', () => ({ transcriptionService: saves }));
vi.mock('@shared/utils/appEvents', () => ({ notifyAppEvent: vi.fn() }));
const live = vi.hoisted(() => ({ active: vi.fn(() => false), finish: vi.fn() }));
vi.mock('@features/recording/live', async (original) => ({
  ...(await original<typeof import('@features/recording/live')>()),
  liveTranscript: live,
}));

import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';
import { meetingLiveActions } from '@features/recording/live';

/** A stored meeting whose status follows the store's step rules (as `meeting_steps.rs` keeps them). */
let status: MeetingStatus;
let transcript: string | null;
let runningStep = false;

const WORKING: Record<MeetingStep, MeetingStatus['status']> = { transcribe: 'transcribing', summarize: 'summarizing' };
const WAITING: Record<MeetingStep, MeetingStatus['status']> = { transcribe: 'captured', summarize: 'transcribed' };

const meeting = () => ({
  index: { id: 'm1', title: 'Recording', categories: [], status, recordingFileName: 'm1.wav', createdAt: '', updatedAt: '' },
  transcript: transcript === null ? undefined : { text: transcript, createdAt: '' },
  notes: [],
  todos: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  status = { status: 'captured' };
  transcript = null;
  db.get.mockImplementation(async () => meeting());
  runningStep = false;
  db.beginStep.mockImplementation(async (_id: string, step: MeetingStep) => {
    if (runningStep) return false;
    runningStep = true;
    status = { status: WORKING[step] };
    return true;
  });
  db.endStep.mockImplementation(async (_id: string, step: MeetingStep, end: MeetingStepEnd) => {
    runningStep = false;
    if (end.kind === 'cancelled') status = { status: WAITING[step] };
    if (end.kind === 'failed') status = { status: 'failed', failedStep: step, error: end.error };
  });
  saves.saveTranscript.mockImplementation(async ({ text }: { text: string }) => { transcript = text; status = { status: 'transcribed' }; });
  saves.saveSummary.mockImplementation(async () => { status = { status: 'ready' }; });
  ai.transcribeAudio.mockResolvedValue({ text: 'hello', segments: [] });
  ai.processTranscript.mockResolvedValue({ title: 'Standup', summary: { overview: 'ov', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] }, categories: ['Work'] });
  meetingPipeline.configure(() => ({ settings: { transcriptionProvider: 'openai', transcriptionModel: 'whisper-1' } as never, providers: [], categories: [] }));
});

describe('meetingPipeline.run', () => {
  it('takes a captured recording to ready, saving the transcript before the summary', async () => {
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ meetingId: 'm1', text: 'hello', model: 'openai::whisper-1' }));
    expect(saves.saveSummary).toHaveBeenCalledWith(expect.objectContaining({ meetingId: 'm1', title: 'Standup', categories: ['Work'] }));
    expect(status).toEqual({ status: 'ready' });
  });

  it('labels the final transcript by who spoke, from the in-call draft that heard each side separately', async () => {
    meetingLiveActions.start('m1');
    meetingLiveActions.set([
      { source: 'microphone', startMs: 0, endMs: 3_000, text: 'we ship', timed: true },
      { source: 'system', startMs: 3_000, endMs: 6_000, text: 'friday works', timed: true },
    ]);
    ai.transcribeAudio.mockResolvedValue({
      text: 'We ship Friday? Friday works.',
      segments: [{ text: 'We ship Friday?', startSecond: 0.2, endSecond: 2.8 }, { text: 'Friday works.', startSecond: 3.1, endSecond: 5.6 }],
    });
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: '[00:00] You: We ship Friday?\n[00:03] Others: Friday works.' }));
    meetingLiveActions.start('other');
  });

  it('keeps the labels when another recording takes the draft while this one transcribes', async () => {
    meetingLiveActions.start('m1');
    meetingLiveActions.set([{ source: 'microphone', startMs: 0, endMs: 3_000, text: 'we ship', timed: true }]);
    ai.transcribeAudio.mockImplementation(async () => {
      meetingLiveActions.start('next-recording');
      return { text: 'We ship.', segments: [{ text: 'We ship.', startSecond: 0.2, endSecond: 2.8 }] };
    });
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: '[00:00] You: We ship.' }));
  });

  it('re-transcribing without a draft keeps the speakers of the meeting\'s own transcript', async () => {
    meetingLiveActions.start('other');
    db.get.mockImplementation(async () => ({ ...meeting(), transcript: { text: 'old', createdAt: '', segments: [{ text: 'old', startSecond: 0, endSecond: 3, speaker: 'Others' }] } }));
    ai.transcribeAudio.mockResolvedValue({ text: 'Friday works.', segments: [{ text: 'Friday works.', startSecond: 0.5, endSecond: 2.5 }] });
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: '[00:00] Others: Friday works.' }));
  });

  it('records a speech-to-text failure at transcribe, with nothing saved', async () => {
    ai.transcribeAudio.mockRejectedValue(new Error('No API key'));
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).not.toHaveBeenCalled();
    expect(status).toEqual({ status: 'failed', failedStep: 'transcribe', error: 'No API key' });
  });

  it('keeps the transcript when the summary fails, and Retry reruns only the summary', async () => {
    ai.processTranscript.mockRejectedValueOnce(new Error('quota'));
    await meetingPipeline.run('m1');
    expect(transcript).toBe('hello');
    expect(status).toEqual({ status: 'failed', failedStep: 'summarize', error: 'quota' });

    await meetingPipeline.run('m1');
    expect(ai.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(status).toEqual({ status: 'ready' });
  });

  it('cancel stops the run and puts the meeting back to waiting', async () => {
    ai.transcribeAudio.mockImplementation(({ size }: Blob, _s: unknown, _p: unknown, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error(`aborted ${size}`)))));
    const run = meetingPipeline.run('m1');
    await vi.waitFor(() => expect(ai.transcribeAudio).toHaveBeenCalled());
    meetingPipeline.cancel('m1');
    await run;
    expect(status).toEqual({ status: 'captured' });
    expect(saves.saveSummary).not.toHaveBeenCalled();
  });

  it('runs a meeting once when asked twice at the same time', async () => {
    await Promise.all([meetingPipeline.run('m1'), meetingPipeline.run('m1')]);
    expect(ai.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(saves.saveSummary).toHaveBeenCalledTimes(1);
    expect(status).toEqual({ status: 'ready' });
  });

  it('after Stop, a whole in-call transcript is the meeting\'s transcript: nothing is transcribed again', async () => {
    live.active.mockReturnValue(true);
    live.finish.mockResolvedValue({ complete: true, entries: [
      { source: 'microphone', startMs: 0, endMs: 3_000, text: 'We ship Friday?', timed: true },
      { source: 'system', startMs: 3_000, endMs: 6_000, text: 'Friday works.', timed: true },
    ] });
    meetingPipeline.recorded('m1');
    await vi.waitFor(() => expect(status).toEqual({ status: 'ready' }));
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: '[00:00] You: We ship Friday?\n[00:03] Others: Friday works.' }));
    live.active.mockReturnValue(false);
  });

  it('after Stop, a draft with a gap is replaced by transcribing the whole recording', async () => {
    live.active.mockReturnValue(true);
    live.finish.mockResolvedValue({ complete: false, entries: [{ source: 'microphone', startMs: 0, endMs: 3_000, text: 'We ship', timed: true }] });
    meetingPipeline.recorded('m1');
    await vi.waitFor(() => expect(status).toEqual({ status: 'ready' }));
    expect(ai.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }));
    live.active.mockReturnValue(false);
  });

  it('Save for later keeps the whole in-call transcript and writes no summary', async () => {
    live.active.mockReturnValue(true);
    live.finish.mockResolvedValue({ complete: true, entries: [{ source: 'microphone', startMs: 0, endMs: 3_000, text: 'Ship Friday.', timed: true }] });
    meetingPipeline.recorded('m1', true);
    await vi.waitFor(() => expect(status).toEqual({ status: 'transcribed' }));
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: '[00:00] You: Ship Friday.' }));
    expect(ai.processTranscript).not.toHaveBeenCalled();
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
    live.active.mockReturnValue(false);
  });

  it('Save for later with a draft that has a gap leaves the meeting waiting for Transcribe', async () => {
    live.active.mockReturnValue(true);
    live.finish.mockResolvedValue({ complete: false, entries: [] });
    meetingPipeline.recorded('m1', true);
    await vi.waitFor(() => expect(live.finish).toHaveBeenCalled());
    expect(saves.saveTranscript).not.toHaveBeenCalled();
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
    expect(status).toEqual({ status: 'captured' });
    live.active.mockReturnValue(false);
  });

  it('does nothing for a recording that failed to record', async () => {
    status = { status: 'failed', failedStep: 'record', error: 'no audio' };
    await meetingPipeline.run('m1');
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
  });
});
