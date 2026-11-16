import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MeetingStatus } from '@shared/types/meetingPhase';

const db = vi.hoisted(() => ({ get: vi.fn(), setStatus: vi.fn() }));
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
vi.mock('@services/transcription.service', () => ({
  transcriptionService: saves,
  meetingSummaryOf: () => ({ overview: 'ov', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] }),
}));
vi.mock('@shared/utils/appEvents', () => ({ notifyAppEvent: vi.fn() }));

import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';

/** A stored meeting whose status follows the pipeline's writes. */
let status: MeetingStatus;
let transcript: string | null;

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
  db.setStatus.mockImplementation(async (_id: string, next: MeetingStatus) => { status = next; });
  saves.saveTranscript.mockImplementation(async ({ text }: { text: string }) => { transcript = text; status = { status: 'transcribed' }; });
  saves.saveSummary.mockImplementation(async () => { status = { status: 'ready' }; });
  ai.transcribeAudio.mockResolvedValue({ text: 'hello', segments: [] });
  ai.processTranscript.mockResolvedValue({ title: 'Standup', summary: 'ov', categories: ['Work'], transcript: 'hello' });
  meetingPipeline.configure(() => ({ settings: { transcriptionProvider: 'openai', transcriptionModel: 'whisper-1' } as never, providers: [], categories: [] }));
});

describe('meetingPipeline.run', () => {
  it('takes a captured recording to ready, saving the transcript before the summary', async () => {
    await meetingPipeline.run('m1');
    expect(saves.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({ meetingId: 'm1', text: 'hello', model: 'openai::whisper-1' }));
    expect(saves.saveSummary).toHaveBeenCalledWith(expect.objectContaining({ meetingId: 'm1', title: 'Standup', categories: ['Work'] }));
    expect(status).toEqual({ status: 'ready' });
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

  it('does nothing for a recording that failed to record', async () => {
    status = { status: 'failed', failedStep: 'record', error: 'no audio' };
    await meetingPipeline.run('m1');
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
  });
});
