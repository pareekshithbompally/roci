import type React from 'react';
/** The record screen through the real path: the transcript beside Your notes alone (no AI pane), and the running meeting joining
 *  its search index each time the transcript moves a step on (no AI model involved). */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const indexStretch = vi.hoisted(() => vi.fn(async (_meetingId: string, _text: string) => [] as string[]));
vi.mock('@extensions/rag', () => ({ indexStretch }));
vi.mock('@shared/utils/modelResolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/utils/modelResolver')>()),
  resolveSummaryModel: () => ({ provider: 'google', modelId: 'test', apiKey: 'k' }),
  requiresApiKey: () => false,
}));
vi.mock('@services/coreAudio.service', () => ({
  coreAudioService: { recorderState: vi.fn(async () => ({ state: 'idle' })) },
  isPermissionRefusal: () => false,
  captureErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => false, menubarService: { setRecordingState: vi.fn() } }));
vi.mock('@features/recording/pipeline/meetingPipeline', () => ({ meetingPipeline: { recorded: vi.fn(), prime: vi.fn() } }));
vi.mock('@shared/contexts/SettingsContext', () => ({ useSettings: () => ({ settings: {}, providers: [] }) }));
vi.mock('@shared/hooks/useMeetings', () => ({ useMeetingBrief: () => ({ id: 'm1', title: 'Sync' }) }));
vi.mock('@features/notes', () => ({
  useMeetingNotes: () => ({ notes: [], isLoading: false, addNote: vi.fn(async () => undefined), updateNote: vi.fn(), deleteNote: vi.fn() }),
}));

// eslint-disable-next-line import/first
import { RecordingMeetingView } from '@features/recording/components/RecordingMeetingView';

/** The app's query provider (model logos read through it). */
const withQuery = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
// eslint-disable-next-line import/first
import { mirrorOf, useRecordingStore } from '@features/recording/stores/recordingStore';
// eslint-disable-next-line import/first
import { meetingLiveActions } from '@features/recording/live/meetingLiveStore';
// eslint-disable-next-line import/first
import { useLiveNotesStore } from '@features/recording/notes/liveNotesStore';
// eslint-disable-next-line import/first
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
// eslint-disable-next-line import/first
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';

const line = (startMs: number, endMs: number, text: string) => ({ source: 'system' as const, startMs, endMs, text, timed: true });

beforeEach(() => {
  indexStretch.mockClear();
  window.HTMLElement.prototype.scrollTo ??= vi.fn() as unknown as typeof window.HTMLElement.prototype.scrollTo;
  useLiveNotesStore.setState({ meetingId: null, lines: [] });
  useRecordingStore.setState({ ...mirrorOf({ state: 'recording', meetingId: 'm1', recordedMs: 0, paused: false, liveStreaming: false }, Date.now()), busy: false, justStopped: null });
  meetingLiveActions.start('m1');
});

describe('the record screen', () => {
  it('shows the transcript beside Your notes, with no AI pane while recording', () => {
    render(<RecordingMeetingView />, { wrapper: withQuery });
    expect(screen.getByText(NOTES.copy.yourNotes)).toBeInTheDocument();
    expect(screen.queryByText(NOTES.copy.aiNotes)).not.toBeInTheDocument();
  });

  it('adds the running meeting to its search index each step of transcript, only the new lines', async () => {
    const step = LIVE.indexStepMs;
    const first = line(0, 5_000, 'Budget is approved at 1.2 million.');
    const second = line(step - 3_000, step, 'Finance signs off.');
    const third = line(2 * step - 2_000, 2 * step, 'We pause hiring.');

    await act(async () => meetingLiveActions.set([first]));
    expect(indexStretch).not.toHaveBeenCalled();

    await act(async () => meetingLiveActions.set([first, second]));
    expect(indexStretch).toHaveBeenCalledTimes(1);
    expect(indexStretch.mock.calls[0]).toEqual(['m1', expect.stringContaining('Finance signs off.')]);

    await act(async () => meetingLiveActions.set([first, second, third]));
    expect(indexStretch).toHaveBeenCalledTimes(2);
    expect(indexStretch.mock.calls[1][1]).toContain('We pause hiring.');
    expect(indexStretch.mock.calls[1][1]).not.toContain('Finance signs off.');
  });
});
