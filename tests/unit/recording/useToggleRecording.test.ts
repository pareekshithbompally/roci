/** Start or stop recording from one place (⌥⇧R and ⌘K): stop while recording, start otherwise, nothing while busy. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ start: vi.fn(async () => 'm1'), stop: vi.fn(async () => 'm1'), state: { meetingId: null as string | null, busy: false } }));
vi.mock('@features/recording/hooks/useStartRecording', () => ({ useStartRecording: () => mocks.start }));
vi.mock('@features/recording/stores/recordingStore', () => ({
  recording: { stop: mocks.stop },
  useRecordingStore: { getState: () => mocks.state },
}));

// eslint-disable-next-line import/first
import { useToggleRecording } from '@features/recording/hooks/useToggleRecording';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { meetingId: null, busy: false };
});

describe('useToggleRecording', () => {
  it('starts when nothing is recording', async () => {
    const { result } = renderHook(() => useToggleRecording());
    await act(() => result.current());
    expect(mocks.start).toHaveBeenCalled();
  });

  it('stops while recording', async () => {
    mocks.state = { meetingId: 'm1', busy: false };
    const { result } = renderHook(() => useToggleRecording());
    await act(() => result.current());
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('does nothing while a start or stop is in flight', async () => {
    mocks.state = { meetingId: null, busy: true };
    const { result } = renderHook(() => useToggleRecording());
    await act(() => result.current());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
});
