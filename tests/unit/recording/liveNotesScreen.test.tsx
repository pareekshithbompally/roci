import type React from 'react';
/** AI notes on the record screen through the real path: transcript arrives → an update runs on the cadence → points show. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/liveNotes', () => ({ refreshLiveNotes: refresh }));
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

const line = (startMs: number, endMs: number, text: string) => ({ source: 'system' as const, startMs, endMs, text, timed: true });

beforeEach(() => {
  refresh.mockReset();
  window.HTMLElement.prototype.scrollTo ??= vi.fn() as unknown as typeof window.HTMLElement.prototype.scrollTo;
  useLiveNotesStore.setState({ meetingId: null, lines: [], bullets: [], updating: false });
  useRecordingStore.setState({ ...mirrorOf({ state: 'recording', meetingId: 'm1', recordedMs: 0, paused: false, liveStreaming: false }, Date.now()), busy: false, justStopped: null });
  meetingLiveActions.start('m1');
});

describe('AI notes on the record screen', () => {
  it('write the meeting\'s points on the cadence with no notes typed, and keep adding', async () => {
    refresh.mockResolvedValueOnce({ points: [{ text: 'Q3 budget: 1.2M approved.' }], filled: [] });
    refresh.mockResolvedValueOnce({ points: [{ text: 'Hiring paused until January.' }], filled: [] });
    render(<RecordingMeetingView />, { wrapper: withQuery });

    await act(async () => meetingLiveActions.set([line(0, 5_000, 'Budget is approved at 1.2 million.')]));
    expect(refresh).not.toHaveBeenCalled();

    const step = NOTES.transcriptStepMs;
    await act(async () => meetingLiveActions.set([line(0, 5_000, 'Budget is approved at 1.2 million.'), line(step - 3_000, step, 'Finance signs off.')]));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Q3 budget: 1.2M approved.')).toBeInTheDocument();

    await act(async () => meetingLiveActions.set([
      line(0, 5_000, 'Budget is approved at 1.2 million.'), line(step - 3_000, step, 'Finance signs off.'), line(2 * step - 2_000, 2 * step, 'We pause hiring.'),
    ]));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Hiring paused until January.')).toBeInTheDocument();
    expect(screen.getByText('Q3 budget: 1.2M approved.')).toBeInTheDocument();
  });
});
