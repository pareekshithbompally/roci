import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecorderState } from '@services/coreAudio.service';

const audio = vi.hoisted(() => ({ recorderState: vi.fn(), stopCapture: vi.fn() }));
const menubar = vi.hoisted(() => ({ setRecordingState: vi.fn(async () => undefined) }));

vi.mock('@services/coreAudio.service', () => ({
  coreAudioService: audio,
  isPermissionRefusal: () => false,
  captureErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true, menubarService: menubar }));
vi.mock('@services/notifications', () => ({ removeNotices: vi.fn(async () => undefined) }));
vi.mock('@features/recording/pipeline/meetingPipeline', () => ({ meetingPipeline: { recorded: vi.fn() } }));

import { mirrorOf, recordedSeconds, recording, useRecordingStore } from '@features/recording/stores/recordingStore';
import { meetingPipeline } from '@features/recording/pipeline/meetingPipeline';
import { useAppStore } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';

const recorded = meetingPipeline.recorded as unknown as ReturnType<typeof vi.fn>;

const RUNNING: RecorderState = { state: 'recording', meetingId: 'm1', recordedMs: 61_500, paused: false, liveStreaming: false };
const IDLE: RecorderState = { state: 'idle' };

beforeEach(() => {
  vi.clearAllMocks();
  useRecordingStore.setState({ ...mirrorOf(IDLE, 0), busy: false, justStopped: null });
});

describe('recordedSeconds', () => {
  it('runs on from the last read while recording', () => {
    expect(recordedSeconds(mirrorOf(RUNNING, 1_000), 1_000)).toBe(61);
    expect(recordedSeconds(mirrorOf(RUNNING, 1_000), 3_000)).toBe(63);
  });

  it('holds still while paused', () => {
    expect(recordedSeconds(mirrorOf({ ...RUNNING, paused: true }, 1_000), 60_000)).toBe(61);
  });

  it('is zero when idle', () => {
    expect(recordedSeconds(mirrorOf(IDLE, 1_000), 60_000)).toBe(0);
  });
});

describe('recording', () => {
  it('sync picks up a recording that outlived the page', async () => {
    audio.recorderState.mockResolvedValue(RUNNING);
    await recording.sync();
    expect(useRecordingStore.getState()).toMatchObject({ meetingId: 'm1', recordedMs: 61_500, paused: false, liveStreaming: false });
    expect(menubar.setRecordingState).toHaveBeenCalledWith(true, false);
  });

  it('sync leaves the store as it was when the recorder cannot be read', async () => {
    audio.recorderState.mockResolvedValueOnce(RUNNING).mockRejectedValueOnce(new Error('ipc down'));
    await recording.sync();
    await recording.sync();
    expect(useRecordingStore.getState().meetingId).toBe('m1');
  });

  it('stop asks the recorder even when the store thinks nothing is running', async () => {
    audio.stopCapture.mockResolvedValue('m1');
    audio.recorderState.mockResolvedValue(IDLE);
    await expect(recording.stop()).resolves.toBe('m1');
    expect(audio.stopCapture).toHaveBeenCalledOnce();
    expect(useRecordingStore.getState()).toMatchObject({ meetingId: null, busy: false, justStopped: 'm1' });
  });

  it('stop opens the meeting on its Transcript tab and hands it to the pipeline', async () => {
    audio.stopCapture.mockResolvedValue('m1');
    audio.recorderState.mockResolvedValue(IDLE);
    await recording.stop();
    expect(recorded).toHaveBeenCalledWith('m1');
    expect(useAppStore.getState().selectedHistoryId).toBe('m1');
    expect(useAppStore.getState()).toMatchObject({ status: AppStatus.RESULTS, activeResultTab: 'transcript' });
  });
});
