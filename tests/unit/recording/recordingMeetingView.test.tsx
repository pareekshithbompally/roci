import type React from 'react';
/** Record screen through the real public path: store → view → stop → RESULTS. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const audio = vi.hoisted(() => ({
  recorderState: vi.fn(async () => ({ state: 'idle' as const })),
  stopCapture: vi.fn(async () => 'm1'),
  pauseCapture: vi.fn(async () => undefined),
  resumeCapture: vi.fn(async () => undefined),
}));
const menubar = vi.hoisted(() => ({ setRecordingState: vi.fn(async () => undefined) }));
const pipeline = vi.hoisted(() => ({ recorded: vi.fn() }));
const notesApi = vi.hoisted(() => ({
  notes: [],
  isLoading: false,
  addNote: vi.fn(async () => undefined),
  updateNote: vi.fn(async () => undefined),
  deleteNote: vi.fn(async () => undefined),
}));

vi.mock('@services/coreAudio.service', () => ({
  coreAudioService: audio,
  isPermissionRefusal: () => false,
  captureErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true, menubarService: menubar }));
vi.mock('@services/notifications', () => ({ removeNotices: vi.fn(async () => undefined) }));
vi.mock('@features/recording/pipeline/meetingPipeline', () => ({ meetingPipeline: pipeline }));
vi.mock('@shared/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { transcriptionProvider: 'openai', transcriptionModel: 'whisper-1', liveTranscription: true }, providers: [] }),
}));
vi.mock('@features/notes', () => ({ useMeetingNotes: () => notesApi }));
vi.mock('@shared/hooks/useMeetings', () => ({ useMeetingBrief: () => ({ id: 'm1', title: 'Test Meeting' }) }));

// eslint-disable-next-line import/first
import { RecordingMeetingView } from '@features/recording/components/RecordingMeetingView';

/** The app's query provider (model logos read through it). */
const withQuery = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
// eslint-disable-next-line import/first
import { mirrorOf, useRecordingStore } from '@features/recording/stores/recordingStore';
// eslint-disable-next-line import/first
import { meetingLiveActions, useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';
// eslint-disable-next-line import/first
import { useAppStore } from '@shared/stores/appStore';
// eslint-disable-next-line import/first
import { AppStatus } from '@shared/types';
// eslint-disable-next-line import/first
import { useLiveNotesStore } from '@features/recording/notes/liveNotesStore';
// eslint-disable-next-line import/first
import { useActivityStore } from '@shared/stores/activityStore';
// eslint-disable-next-line import/first
import { RECORDING_ROW } from '@features/recording/hooks/useRecordingClock';

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollTo ??= vi.fn() as unknown as typeof window.HTMLElement.prototype.scrollTo;
  useRecordingStore.setState({ ...mirrorOf({ state: 'idle' }, 0), busy: false, justStopped: null });
  useMeetingLiveStore.setState({ meetingId: null, entries: [] });
  useLiveNotesStore.setState({ meetingId: null, lines: [] });
  useAppStore.setState({ status: AppStatus.IDLE, selectedHistoryId: null, activeResultTab: 'summary' });
});

function startRecording() {
  useRecordingStore.setState({
    ...mirrorOf({ state: 'recording', meetingId: 'm1', recordedMs: 65_000, paused: false, liveStreaming: false }, Date.now()),
    busy: false,
    justStopped: null,
  });
  meetingLiveActions.start('m1');
  // the recording runtime keeps the clock in the recording's activity row
  useActivityStore.setState({ items: [{ id: RECORDING_ROW, type: 'recording', status: 'active', label: 'Recording', detail: '01:05', percent: null, step: null, error: null, actions: [] }] });
}

describe('RecordingMeetingView', () => {
  it('shows the title, the clock and status on their own row, then the transcript labelled by who spoke', async () => {
    startRecording();
    render(<RecordingMeetingView />, { wrapper: withQuery });

    expect(screen.getByText('Test Meeting')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
    // the state is a badge beside the title, not a line under the transcript
    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(screen.getByText('Listening for speech…')).toBeInTheDocument();

    meetingLiveActions.set([
      { source: 'microphone', startMs: 0, endMs: 2_000, text: 'Shall we start?', timed: true },
      { source: 'microphone', startMs: 2_000, endMs: 4_000, text: 'Agenda first.', timed: true },
      { source: 'system', startMs: 5_000, endMs: 7_000, text: 'Sounds good.', timed: false },
    ]);
    // one speaker's close lines read as one turn
    expect(await screen.findByText('Shall we start? Agenda first.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Others')).toBeInTheDocument();
    expect(screen.getByText('Sounds good.')).toBeInTheDocument();
    expect(screen.queryByText('Listening…')).not.toBeInTheDocument();
  });

  it('stop hands off to the results view on the transcript tab', async () => {
    startRecording();
    useAppStore.setState({ status: AppStatus.RESULTS, selectedHistoryId: 'm1' });
    render(<RecordingMeetingView />, { wrapper: withQuery });

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await waitFor(() => expect(useRecordingStore.getState().meetingId).toBeNull());
    expect(useRecordingStore.getState().justStopped).toBe('m1');
    expect(useAppStore.getState().status).toBe(AppStatus.RESULTS);
    expect(useAppStore.getState().activeResultTab).toBe('transcript');
    expect(pipeline.recorded).toHaveBeenCalledWith('m1', false);
  });

  it('saves the typed lines as the meeting\'s notes before it stops', async () => {
    startRecording();
    render(<RecordingMeetingView />, { wrapper: withQuery });

    fireEvent.change(screen.getByRole('textbox', { name: 'Your notes' }), { target: { value: 'launch date?\n\nask Raj' } });
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await waitFor(() => expect(useRecordingStore.getState().meetingId).toBeNull());
    expect(notesApi.addNote).toHaveBeenCalledTimes(2);
    expect(notesApi.addNote).toHaveBeenCalledWith('launch date?', expect.objectContaining({ id: expect.any(String) }));
    expect(notesApi.addNote).toHaveBeenCalledWith('ask Raj', expect.objectContaining({ id: expect.any(String) }));
  });

  it('puts the transcript beside Your notes, open for typing, with no AI Summary while recording', () => {
    startRecording();
    render(<RecordingMeetingView />, { wrapper: withQuery });

    expect(screen.getByText('Live transcript')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your notes' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Your notes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Summary/)).not.toBeInTheDocument();
  });

  it('offers Save for Later only while paused, beside Resume and Stop', () => {
    startRecording();
    const { rerender } = render(<RecordingMeetingView />, { wrapper: withQuery });
    expect(screen.queryByRole('button', { name: /Save for Later/ })).not.toBeInTheDocument();
    act(() => useRecordingStore.setState({ paused: true }));
    rerender(<RecordingMeetingView />);
    expect(screen.getByRole('button', { name: /Save for Later/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Stop/ })).toBeInTheDocument();
  });

  it('the status badge follows the recorder: Recording, then Paused while it is paused', () => {
    startRecording();
    const { rerender } = render(<RecordingMeetingView />, { wrapper: withQuery });
    expect(screen.getByText('Recording')).toBeInTheDocument();
    act(() => useRecordingStore.setState({ paused: true }));
    rerender(<RecordingMeetingView />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('keeps one status while chunks are transcribed, and says so when the live transcript stops', () => {
    startRecording();
    
    const { rerender } = render(<RecordingMeetingView />, { wrapper: withQuery });
    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(screen.queryByText(/Live transcript unavailable/)).not.toBeInTheDocument();
    meetingLiveActions.fail('Add your OpenAI API key in Settings › Providers.');
    rerender(<RecordingMeetingView />);
    expect(screen.getByText('Live transcript unavailable. Audio is still recording safely. Add your OpenAI API key in Settings › Providers.')).toBeInTheDocument();
    expect(screen.queryByText('Listening for speech…')).not.toBeInTheDocument();
  });
});
