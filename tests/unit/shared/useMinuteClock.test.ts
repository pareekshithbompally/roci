/** A visible clock: ticks on each minute boundary only while the window is on screen. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMinuteClock } from '@shared/hooks/useMinuteClock';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useMinuteClock', () => {
  it('arms no timer while the window is hidden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 21, 28, 30));
    setVisibility('hidden');
    renderHook(() => useMinuteClock());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns over at the next minute while visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 21, 28, 30));
    const { result } = renderHook(() => useMinuteClock());
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.getMinutes()).toBe(29);
  });
});
