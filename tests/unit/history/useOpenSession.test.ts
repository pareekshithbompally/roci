/** One way to open what the sidebar and ⌘K list: a meeting opens its view, a chat opens the chat. */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { UnifiedSidebarItem } from '@shared/types';

const mocks = vi.hoisted(() => ({ openMeeting: vi.fn(async () => undefined), openChat: vi.fn() }));
vi.mock('@features/history/hooks/useOpenMeeting', () => ({ useOpenMeeting: () => mocks.openMeeting }));
vi.mock('@features/chat', () => ({ openChat: mocks.openChat }));

// eslint-disable-next-line import/first
import { useOpenSession } from '@features/history/hooks/useOpenSession';

describe('useOpenSession', () => {
  it('a meeting opens through the meeting view', async () => {
    const { result } = renderHook(() => useOpenSession());
    const meeting = { id: 'm1', type: 'meeting', historyItem: { id: 'm1' } } as unknown as UnifiedSidebarItem;
    await act(async () => { await result.current(meeting); });
    expect(mocks.openMeeting).toHaveBeenCalledWith(meeting.historyItem);
  });

  it('a chat opens the chat', async () => {
    const { result } = renderHook(() => useOpenSession());
    await act(async () => { await result.current({ id: 'c1', type: 'chat' } as unknown as UnifiedSidebarItem); });
    expect(mocks.openChat).toHaveBeenCalledWith('c1');
  });

  it('a failed open is logged, never an unhandled rejection', async () => {
    mocks.openMeeting.mockRejectedValueOnce(new Error('gone'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useOpenSession());
    const meeting = { id: 'm2', type: 'meeting', historyItem: { id: 'm2' } } as unknown as UnifiedSidebarItem;
    await act(async () => { await result.current(meeting); });
    expect(error).toHaveBeenCalledWith('[useOpenSession] Opening failed:', expect.any(Error));
    error.mockRestore();
  });
});
