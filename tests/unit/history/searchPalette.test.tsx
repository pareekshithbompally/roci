/** The ⌘K panel: recents when empty, matches by kind with where they matched, the pick opens, Escape closes. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { UnifiedSidebarItem } from '@shared/types';

const mocks = vi.hoisted(() => ({
  openMeeting: vi.fn(async () => undefined),
  openChat: vi.fn(),
  spotlightSearch: vi.fn(async () => [] as unknown[]),
}));

const ITEMS = [
  { id: 'm1', type: 'meeting', title: 'Weekly Sync', timestamp: 2, historyItem: { id: 'm1' } },
  { id: 'c1', type: 'chat', title: 'Pricing brainstorm', timestamp: 1 },
] as unknown as UnifiedSidebarItem[];

vi.mock('@features/history/hooks/useUnifiedSidebar', () => ({ useUnifiedSidebar: () => ({ items: ITEMS }) }));
vi.mock('@features/history/hooks/useOpenMeeting', () => ({ useOpenMeeting: () => mocks.openMeeting }));
vi.mock('@features/chat', () => ({ openChat: mocks.openChat }));
vi.mock('@extensions/rag/client', () => ({ vectorDB: { spotlightSearch: mocks.spotlightSearch } }));

// eslint-disable-next-line import/first
import { SearchPalette } from '@features/history/components/SearchPalette';
// eslint-disable-next-line import/first
import { startSearch, endSearch } from '@shared/stores/searchStore';

// jsdom has no layout: cmdk scrolls the highlighted row into view.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  endSearch();
  vi.clearAllMocks();
});

const openPalette = () => {
  render(<SearchPalette />);
  act(() => startSearch());
};

describe('SearchPalette', () => {
  it('shows recents before anything is typed', () => {
    openPalette();
    expect(screen.getByText('Weekly Sync')).toBeTruthy();
    expect(screen.getByText('Pricing brainstorm')).toBeTruthy();
  });

  it('shows the matches for what is typed', () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText('Search meetings and chats'), { target: { value: 'pricing' } });
    expect(screen.getByText('Pricing brainstorm')).toBeTruthy();
    expect(screen.queryByText('Weekly Sync')).toBeNull();
  });

  it('opening a meeting result opens it and closes the panel', async () => {
    openPalette();
    await act(async () => { fireEvent.click(screen.getByText('Weekly Sync')); });
    expect(mocks.openMeeting).toHaveBeenCalledWith(ITEMS[0].historyItem);
    expect(screen.queryByPlaceholderText('Search meetings and chats')).toBeNull();
  });

  it('opening a chat result opens the chat', async () => {
    openPalette();
    await act(async () => { fireEvent.click(screen.getByText('Pricing brainstorm')); });
    expect(mocks.openChat).toHaveBeenCalledWith('c1');
  });
});
