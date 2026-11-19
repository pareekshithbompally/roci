/** The ⌘K panel: recents when empty, matches by kind with where they matched, the pick opens, Escape closes. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { UnifiedSidebarItem } from '@shared/types';

const mocks = vi.hoisted(() => ({
  openMeeting: vi.fn(async () => undefined),
  openChat: vi.fn(),
  spotlightSearch: vi.fn(async () => [] as unknown[]),
  setTheme: vi.fn(),
}));

const ITEMS = [
  { id: 'm1', type: 'meeting', title: 'Weekly Sync', timestamp: 2, historyItem: { id: 'm1' } },
  { id: 'c1', type: 'chat', title: 'Pricing brainstorm', timestamp: 1 },
] as unknown as UnifiedSidebarItem[];

vi.mock('@features/history/hooks/useUnifiedSidebar', () => ({ useUnifiedSidebar: () => ({ items: ITEMS }) }));
vi.mock('@features/history/hooks/useOpenMeeting', () => ({ useOpenMeeting: () => mocks.openMeeting }));
vi.mock('@features/chat', () => ({ openChat: mocks.openChat }));
vi.mock('@extensions/rag/client', () => ({ vectorDB: { spotlightSearch: mocks.spotlightSearch } }));
vi.mock('@shared/contexts/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'dark', isDark: true, setTheme: mocks.setTheme }) }));
vi.mock('@features/settings', async () => {
  const { matchesAllWords } = await import('@shared/utils/textMatch');
  const { useQuickSettings } = await import('@features/settings/hooks/useQuickSettings');
  const items = [
    { id: 'providers', label: 'Providers', icon: () => null, group: 'AI', keywords: ['api key', 'openai'] },
    { id: 'mcp', label: 'MCP Servers', icon: () => null, group: 'AI', available: false, keywords: [] },
  ];
  return {
    useQuickSettings,
    findSettings: (query: string) =>
      items.filter((item) => item.available !== false && matchesAllWords([item.label, ...item.keywords].join(' '), query)),
  };
});

// eslint-disable-next-line import/first
import { SearchPalette } from '@features/history/components/SearchPalette';
// eslint-disable-next-line import/first
import { startSearch, endSearch } from '@shared/stores/searchStore';
// eslint-disable-next-line import/first
import { useAppStore } from '@shared/stores/appStore';

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
    fireEvent.change(screen.getByPlaceholderText('Search meetings, chats and settings'), { target: { value: 'pricing' } });
    expect(screen.getByText('Pricing brainstorm')).toBeTruthy();
    expect(screen.queryByText('Weekly Sync')).toBeNull();
  });

  it('opening a meeting result opens it and closes the panel', async () => {
    openPalette();
    await act(async () => { fireEvent.click(screen.getByText('Weekly Sync')); });
    expect(mocks.openMeeting).toHaveBeenCalledWith(ITEMS[0].historyItem);
    expect(screen.queryByPlaceholderText('Search meetings, chats and settings')).toBeNull();
  });

  it('opening a chat result opens the chat', async () => {
    openPalette();
    await act(async () => { fireEvent.click(screen.getByText('Pricing brainstorm')); });
    expect(mocks.openChat).toHaveBeenCalledWith('c1');
  });

  it('finds a Settings section by its name and opens it', async () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText('Search meetings, chats and settings'), { target: { value: 'provid' } });
    await act(async () => { fireEvent.click(screen.getByText('Providers')); });
    expect(useAppStore.getState().currentView).toBe('settings');
    expect(useAppStore.getState().activeSettingsPanel).toBe('providers');
  });

  it('finds a Settings section by what it holds (keywords), never one this device lacks', () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText('Search meetings, chats and settings'), { target: { value: 'api key' } });
    expect(screen.getByText('Providers')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search meetings, chats and settings'), { target: { value: 'mcp' } });
    expect(screen.queryByText('MCP Servers')).toBeNull();
  });

  it('keeps the Settings group at the bottom before anything is typed: appearance and Settings', () => {
    openPalette();
    expect(screen.getByText('Switch to Light Appearance')).toBeTruthy();
    expect(screen.getByText('Open Settings')).toBeTruthy();
  });

  it('switches the appearance from the palette', async () => {
    openPalette();
    await act(async () => { fireEvent.click(screen.getByText('Switch to Light Appearance')); });
    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });

  it('keeps the same layout when nothing matches: the line, and Settings still at the bottom', async () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText('Search meetings, chats and settings'), { target: { value: 'appearance' } });
    expect(await screen.findByText('No meetings or chats match')).toBeTruthy();
    expect(screen.getByText('Switch to Light Appearance')).toBeTruthy();
  });
});
