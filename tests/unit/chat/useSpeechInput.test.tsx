import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppSettings } from '@shared/types';

vi.mock('@services/unifiedAIService', () => ({
  audioToRawText: vi.fn(),
}));

// eslint-disable-next-line import/first
import { useSpeechInput } from '@features/chat/hooks/useSpeechInput';

/** Minimal MediaRecorder stand-in — jsdom ships none. */
class MockMediaRecorder {
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown) {}
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSpeechInput warm-up', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    getUserMedia.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const renderInput = () =>
    renderHook(() => useSpeechInput({} as AppSettings, []));

  const fakeStream = (onTrackStop: () => void) =>
    ({
      getTracks: () => [{ stop: onTrackStop }],
    }) as unknown as MediaStream;

  it('mounts the starting state on the mic-press commit, recording after warm-up', async () => {
    const gate = deferred<MediaStream>();
    getUserMedia.mockReturnValue(gate.promise);
    const { result } = renderInput();

    let started: Promise<void> | undefined;
    act(() => {
      started = result.current.start();
    });
    // Synchronous — the pill is up before the mic is warm.
    expect(result.current.state).toBe('starting');

    const stopTrack = vi.fn();
    await act(async () => {
      gate.resolve(fakeStream(stopTrack));
      await started;
    });
    expect(result.current.state).toBe('recording');
    expect(result.current.stream).not.toBeNull();
  });

  it('holds the starting UI until the enter beat lands', async () => {
    const gate = deferred<MediaStream>();
    getUserMedia.mockReturnValue(gate.promise);
    const { result } = renderInput();

    let started: Promise<void> | undefined;
    act(() => {
      started = result.current.start();
    });
    expect(result.current.state).toBe('starting');

    gate.resolve(fakeStream(vi.fn()));
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });
    // Mic is warm but the beat hasn't landed — still starting, no flip mid-enter.
    expect(result.current.state).toBe('starting');

    await act(async () => {
      await started;
    });
    expect(result.current.state).toBe('recording');
  });

  it('cancel during warm-up wins the race against the late mic', async () => {
    const gate = deferred<MediaStream>();
    getUserMedia.mockReturnValue(gate.promise);
    const { result } = renderInput();

    let started: Promise<void> | undefined;
    act(() => {
      started = result.current.start();
    });
    expect(result.current.state).toBe('starting');

    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBe('idle');

    const stopTrack = vi.fn();
    await act(async () => {
      gate.resolve(fakeStream(stopTrack));
      await started;
    });
    // The late mic never goes live — tracks released, still idle.
    expect(result.current.state).toBe('idle');
    expect(result.current.stream).toBeNull();
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('stop during warm-up resolves empty and discards the late mic', async () => {
    const gate = deferred<MediaStream>();
    getUserMedia.mockReturnValue(gate.promise);
    const { result } = renderInput();

    let started: Promise<void> | undefined;
    act(() => {
      started = result.current.start();
    });

    let stopped: Promise<string> | undefined;
    act(() => {
      stopped = result.current.stop();
    });
    await act(async () => {
      expect(await stopped).toBe('');
      gate.resolve(fakeStream(vi.fn()));
      await started;
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.stream).toBeNull();
  });

  it('mic denial returns to idle without throwing', async () => {
    const gate = deferred<MediaStream>();
    getUserMedia.mockReturnValue(gate.promise);
    const { result } = renderInput();

    let started: Promise<void> | undefined;
    act(() => {
      started = result.current.start();
    });
    expect(result.current.state).toBe('starting');

    await act(async () => {
      gate.reject(new Error('denied'));
      await started;
    });
    expect(result.current.state).toBe('idle');
  });
});
