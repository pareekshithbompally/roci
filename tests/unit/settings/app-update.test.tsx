/** Rust owns update checks; the webview turns its state into one tray row and says how Check for Updates went. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { UpdateState } from '@services/tauri';

const { service, showToast, pushed } = vi.hoisted(() => {
  const pushed: { handler: (state: UpdateState) => void } = { handler: () => undefined };
  return {
    pushed,
    showToast: vi.fn(),
    service: {
      check: vi.fn<() => Promise<UpdateState>>(),
      current: vi.fn<() => Promise<UpdateState>>(),
      install: vi.fn(async () => {}),
      onState: vi.fn((handler: (state: UpdateState) => void) => {
        pushed.handler = handler;
        return () => undefined;
      }),
    },
  };
});
const pushState = (state: UpdateState) => pushed.handler(state);

vi.mock('@services/tauri', () => ({
  isTauriEnvironment: () => true,
  openUrl: vi.fn(),
  updatesService: service,
  IDLE_UPDATE: { status: 'idle' },
}));
vi.mock('@platform/index', () => ({ platform: { hasUpdater: true } }));
vi.mock('@shared/ui', () => ({ showToast }));

// eslint-disable-next-line import/first
import { useAppUpdate, useUpdateRuntime } from '@features/settings/hooks/useAppUpdate';
// eslint-disable-next-line import/first
import { activityStore } from '@shared/stores/activityStore';
// eslint-disable-next-line import/first
import { useUpdateStore } from '@features/settings/stores/updateStore';

const row = () => activityStore.get('app-update');

beforeEach(() => {
  vi.clearAllMocks();
  activityStore.remove('app-update');
  useUpdateStore.setState({ state: { status: 'idle' }, checking: false, deferred: null });
  service.current.mockResolvedValue({ status: 'idle' });
});

describe('useUpdateRuntime', () => {
  it('shows the state Rust holds at mount, then follows its events', async () => {
    service.current.mockResolvedValue({ status: 'available', version: '1.8.0', notes: null });
    renderHook(() => useUpdateRuntime());
    await act(async () => {});
    expect(row()).toMatchObject({ label: 'Roci v1.8.0 available', status: 'waiting' });

    act(() => pushState({ status: 'downloading', version: '1.8.0', downloaded: 50, total: 100 }));
    expect(row()).toMatchObject({ status: 'active', percent: 50 });

    act(() => pushState({ status: 'idle' }));
    expect(row()).toBeUndefined();
  });

  it('Later hides the row for that version only', async () => {
    renderHook(() => useUpdateRuntime());
    await act(async () => {});
    act(() => pushState({ status: 'available', version: '1.8.0', notes: null }));
    act(() => row()?.actions.find((a) => a.label === 'Later')?.onClick());
    expect(row()).toBeUndefined();

    act(() => pushState({ status: 'available', version: '1.9.0', notes: null }));
    expect(row()).toMatchObject({ label: 'Roci v1.9.0 available' });
  });
});

describe('useAppUpdate checkNow', () => {
  it('says up to date when Rust finds nothing', async () => {
    service.check.mockResolvedValue({ status: 'idle' });
    const { result } = renderHook(() => useAppUpdate());
    await act(() => result.current.checkNow());
    expect(showToast).toHaveBeenCalledWith('Roci is up to date', 'success');
    expect(result.current.checking).toBe(false);
  });

  it('says when the check failed', async () => {
    service.check.mockRejectedValue('offline');
    const { result } = renderHook(() => useAppUpdate());
    await act(() => result.current.checkNow());
    expect(showToast).toHaveBeenCalledWith('Could not check for updates', 'error');
  });
});
