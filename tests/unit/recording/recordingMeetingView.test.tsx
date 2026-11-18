/** Record screen through the real public path: store → view → stop → RESULTS. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const audio = vi.hoisted(() => ({
  recorderState: vi.fn(async () => ({ state: 'idle' as const })),
  stopCapture: vi.fn(async () => 'm1'),
  pauseCapture: vi.fn(async () => undefined),
  resumeCapture: vi.fn(async () => undefined),
}));
const menubar = vi.hoisted(() => ({ setRecordingState: vi.fn(async () => undefined) }));
const pipeline = vi.hoisted(() => ({ recorded: vi.fn(), prime: vi.fn(async () => undefined) }));

vi.mock('@services/coreAudio.service', () => ({
  coreAudioService: audio,
  isPermissionRefusal: () => false,
  captureErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true, menubarService: menubar }));
vi.mock('@services/notifications', () => ({ removeNotices: vi.fn(async () => undefined) }));
vi.mock('@features/recording/pipeline/meetingPipeline', () => ({ meetingPipeline: pipeline }));
vi.mock('@shared/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { transcriptionProvider: 'openai', transcriptionModel: 'whisper-1' } }),
}));
vi.mock('@shared/contexts/HistoryContext', () => ({
  useHistoryData: () => ({ items: [{ id: 'm1', title: 'Test Meeting' }], isLoading: false }),
}));

// eslint-disable-next-line import/first
import { RecordingMeetingView } from '@features/recording/components/RecordingMeetingView';
// eslint-disable-next-line import/first
import { mirrorOf, useRecordingStore } from '@features/recording/stores/recordingStore';
// eslint-disable-next-line import/first
import { meetingLiveActions, useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';
// eslint-disable-next-line import/first
import { useAppStore } from '@shared/stores/appStore';
// eslint-disable-next-line import/first
import { AppStatus } from '@shared/types';

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollTo ??= vi.fn() as unknown as typeof window.HTMLElement.prototype.scrollTo;
  useRecordingStore.setState({ ...mirrorOf({ state: 'idle' }, 0), busy: false, justStopped: null });
  useMeetingLiveStore.setState({ meetingId: null, entries: [], pending: 0 });
  useAppStore.setState({ status: AppStatus.IDLE, selectedHistoryId: null, activeResultTab: 'summary' });
});

function startRecording() {
  useRecordingStore.setState({
    ...mirrorOf({ state: 'recording', meetingId: 'm1', recordedMs: 65_000, paused: false }, Date.now()),
    busy: false,
    justStopped: null,
  });
  meetingLiveActions.start('m1');
}

describe('RecordingMeetingView', () => {
  it('shows the title, the clock and status on their own row, then the transcript labelled by who spoke', async () => {
    startRecording();
    render(<RecordingMeetingView />);

    expect(screen.getByText('Test Meeting')).toBeInTheDocument();
    expect(screen.getByText('01:05 · Listening…')).toBeInTheDocument();
    expect(screen.getByText(/labelled by who said them/)).toBeInTheDocument();

    meetingLiveActions.set([
      { source: 'microphone', startMs: 0, endMs: 2_000, text: 'Shall we start?', timed: true },
      { source: 'microphone', startMs: 2_000, endMs: 4_000, text: 'Agenda first.', timed: true },
      { source: 'system', startMs: 5_000, endMs: 7_000, text: 'Sounds good.', timed: false },
    ]);
    expect(await screen.findByText('Shall we start? Agenda first.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Others')).toBeInTheDocument();
    expect(screen.getByText('Sounds good.')).toBeInTheDocument();
  });

  it('stop hands off to the results view on the transcript tab', async () => {
    startRecording();
    useAppStore.setState({ status: AppStatus.RESULTS, selectedHistoryId: 'm1' });
    render(<RecordingMeetingView />);

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await waitFor(() => expect(useRecordingStore.getState().meetingId).toBeNull());
    expect(useRecordingStore.getState().justStopped).toBe('m1');
    expect(useAppStore.getState().status).toBe(AppStatus.RESULTS);
    expect(useAppStore.getState().activeResultTab).toBe('transcript');
    expect(pipeline.prime).toHaveBeenCalledWith('m1', expect.any(String));
    expect(pipeline.recorded).toHaveBeenCalledWith('m1');
  });
});
