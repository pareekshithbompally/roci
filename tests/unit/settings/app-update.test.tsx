/** The startup update check stays silent when the endpoint 404s or in dev; a manual check surfaces failures. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@services/tauri', () => ({
  isTauriEnvironment: () => true,
}));

const checkMock = vi.fn();
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(async () => {}),
}));

// eslint-disable-next-line import/first
import { useAppUpdate, scheduleStartupCheck } from '@features/settings/hooks/useAppUpdate';

const ENDPOINT_ERROR = new Error(
  'update endpoint did not respond with a successful status code',
);

beforeEach(() => {
  checkMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppUpdate endpoint failure', () => {
  it('silent (background) check treats an unreachable endpoint as up-to-date, not an error', async () => {
    checkMock.mockRejectedValueOnce(ENDPOINT_ERROR);
    const { result } = renderHook(() => useAppUpdate());

    let hasUpdate: boolean | undefined;
    await act(async () => {
      hasUpdate = await result.current.checkForUpdate({ silent: true });
    });

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(hasUpdate).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.updateInfo).toBeNull();
  });

  it('manual check still surfaces endpoint errors', async () => {
    checkMock.mockRejectedValueOnce(ENDPOINT_ERROR);
    const { result } = renderHook(() => useAppUpdate());

    let hasUpdate: boolean | undefined;
    await act(async () => {
      hasUpdate = await result.current.checkForUpdate();
    });

    expect(hasUpdate).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('successful status code');
  });

  it('startup check is skipped in dev builds so it never hits the endpoint', () => {
    vi.useFakeTimers();
    const checkFn = vi.fn(async () => {});

    const cleanup = scheduleStartupCheck(checkFn);
    vi.advanceTimersByTime(60_000);

    expect(checkFn).not.toHaveBeenCalled();
    expect(cleanup).toBeUndefined();
  });
});
