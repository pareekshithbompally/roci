/** ⌘K: recents and commands before typing, results then commands while typing; drill-downs; Escape peels one layer. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { UnifiedSidebarItem } from '@shared/types';

const mocks = vi.hoisted(() => ({
  openSession: vi.fn(async () => undefined),
  startNewChat: vi.fn(),
  toggleRecording: vi.fn(async () => undefined),
  setTheme: vi.fn(),
  setCurrentView: vi.fn(),
  openSettings: vi.fn(),
  searchSessions: vi.fn(async () => [] as unknown[]),
}));

const ITEMS = [
  { id: 'm1', type: 'meeting', title: 'Weekly Sync', timestamp: Date.parse('2026-11-19T10:00:00Z'), historyItem: { id: 'm1', status: 'ready' } },
  { id: 'c1', type: 'chat', title: 'Pricing brainstorm', timestamp: Date.parse('2026-11-18T10:00:00Z') },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, type: 'chat', title: `Note ${i}`, timestamp: 0 })),
] as unknown as UnifiedSidebarItem[];

vi.mock('@features/history/hooks/useUnifiedSidebar', () => ({ useUnifiedSidebar: () => ({ items: ITEMS }) }));
vi.mock('@features/history/hooks/useOpenSession', () => ({ useOpenSession: () => mocks.openSession }));
vi.mock('@services/db', () => ({ store: { searchSessions: mocks.searchSessions } }));
vi.mock('@features/chat', () => ({ startNewChat: mocks.startNewChat }));
vi.mock('@features/recording', () => ({ useToggleRecording: () => mocks.toggleRecording, useRecordingMeetingId: () => null }));
vi.mock('@shared/contexts/ThemeContext', () => ({ useThemeContext: () => ({ isDark: true, setTheme: mocks.setTheme }) }));
vi.mock('@shared/contexts/SettingsContext', () => ({ useSettings: () => ({ settings: {} }) }));
// A meeting waiting to be transcribed: a state that shows a status pill (Ready shows none, by the app's rule).
vi.mock('@shared/stores/meetingProgressStore', () => ({ useMeetingPhase: () => ({ kind: 'pending' }) }));
// The sections this device has (the Settings list filters out the ones it lacks).
vi.mock('@features/settings', () => ({
  SETTINGS_SECTIONS: [
    { id: 'general', label: 'General', icon: () => null, group: 'App', keywords: ['microphone'] },
    { id: 'providers', label: 'Providers', icon: () => null, group: 'AI', keywords: ['api key'] },
  ],
}));
vi.mock('@shared/stores/appStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/stores/appStore')>()),
  useAppActions: () => ({ setCurrentView: mocks.setCurrentView, openSettings: mocks.openSettings }),
}));

// jsdom has no layout: cmdk scrolls the highlighted row into view.
Element.prototype.scrollIntoView = vi.fn();

// eslint-disable-next-line import/first
import { CommandPalette } from '@features/palette';
// eslint-disable-next-line import/first
import { startSearch, endSearch } from '@shared/stores/searchStore';

const PLACEHOLDER = 'Search meetings and chats, or type a command…';
const field = () => screen.getByRole('combobox') as HTMLInputElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const groupTitles = () => [...document.querySelectorAll('[cmdk-group-heading]')].map((h) => h.textContent);
const rows = (group: string) => [...screen.getByRole('group', { name: group }).querySelectorAll('[cmdk-item]')].map((r) => r.textContent);
const escape = () => fireEvent.keyDown(field(), { key: 'Escape' });

function openPalette() {
  render(<CommandPalette />);
  act(() => startSearch());
}

beforeEach(() => {
  endSearch();
  vi.clearAllMocks();
});

describe('CommandPalette', () => {
  it('before typing: Recent first (five), then Actions, Go To and Settings', () => {
    openPalette();
    expect(groupTitles()).toEqual(['Recent', 'Actions', 'Go To', 'Settings']);
    expect(rows('Recent')).toHaveLength(5);
  });

  it('a recent meeting shows its date and status, the same row as a search result', () => {
    openPalette();
    expect(rows('Recent')[0]).toContain('Weekly Sync');
    expect(rows('Recent')[0]).toContain('Not transcribed');
    expect(rows('Recent')[0]).toMatch(/2026/);
  });

  it('shows each command with its shortcut keys and a chevron where it drills in', () => {
    openPalette();
    expect(rows('Actions')[0]).toContain('New Chat');
    expect(rows('Actions')[0]).toContain('⌘N');
    expect(rows('Settings').at(-1)).toContain('⌘,');
  });

  it('while typing: results lead, then the matching commands; recents give way', () => {
    openPalette();
    type('pricing');
    expect(groupTitles()[0]).toBe('Chats');
    expect(groupTitles()).not.toContain('Recent');
  });

  it('a kind with more than five matches shows five, then Show All N', () => {
    openPalette();
    type('note');
    expect(rows('Chats')).toHaveLength(6);
    expect(rows('Chats').at(-1)).toContain('Show All 6');
  });

  it('Show All keeps the search and lists the whole kind, breadcrumbed', () => {
    openPalette();
    type('note');
    fireEvent.click(screen.getByText('Show All 6'));
    expect(field().value).toBe('note');
    expect(screen.getByText('Chats', { selector: '[data-palette-breadcrumb] *' })).toBeTruthy();
    expect(document.querySelectorAll('[cmdk-item]')).toHaveLength(6);
  });

  it('says when the search index cannot be read, instead of claiming no results', async () => {
    mocks.searchSessions.mockRejectedValueOnce(new Error('index gone'));
    openPalette();
    type('zzzz');
    expect(await screen.findByText(/Search is unavailable/)).toBeTruthy();
  });

  it('running a command closes the palette, then acts', () => {
    openPalette();
    fireEvent.click(screen.getByText('New Chat'));
    expect(mocks.startNewChat).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
  });

  it('Settings drills into its sections; a section opens there', () => {
    openPalette();
    fireEvent.click(screen.getByText('Settings', { selector: '[cmdk-item] *' }));
    expect(screen.getByText('Providers')).toBeTruthy();
    fireEvent.click(screen.getByText('Providers'));
    expect(mocks.openSettings).toHaveBeenCalledWith('providers');
  });

  it('a Settings section is found by what it holds, from the root', () => {
    openPalette();
    type('api key');
    expect(screen.getByText('Providers')).toBeTruthy();
  });

  it('Escape peels one layer: the text, then the drill level, then the palette', () => {
    openPalette();
    fireEvent.click(screen.getByText('Settings', { selector: '[cmdk-item] *' }));
    type('prov');
    escape();
    expect(field().value).toBe('');
    expect(screen.getByText('Providers')).toBeTruthy();
    escape();
    expect(groupTitles()).toContain('Recent');
    escape();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
  });

  it('Backspace in an empty field goes back from a drill level', () => {
    openPalette();
    fireEvent.click(screen.getByText('Settings', { selector: '[cmdk-item] *' }));
    fireEvent.keyDown(field(), { key: 'Backspace' });
    expect(groupTitles()).toContain('Recent');
  });

  it('the footer says what Escape will do', () => {
    openPalette();
    expect(screen.getByText('Close')).toBeTruthy();
    type('x');
    expect(screen.getByText('Clear')).toBeTruthy();
  });

  it('toggles the theme', () => {
    openPalette();
    fireEvent.click(screen.getByText('Toggle Theme'));
    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });
});

