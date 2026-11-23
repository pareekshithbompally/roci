/** Left sidebar: the app's mark and name and Search fixed at the top, the destinations and history scrolling under them
 *  (edges fade only while there is more), Settings fixed at the foot. */

import React, { useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useSelectedHistoryId, useCurrentView, useAppActions } from '@shared/stores/appStore';
import { UnifiedList } from '@features/history';
import { SettingsNav } from '@features/settings/components/SettingsNav';
import { useOpenSession, useSessionSearch, useUnifiedSidebar } from '@features/history/hooks';
import { LAYOUT } from '@config/layout.config';
import { AppMark, Button, FadeScroll, IconButton, Icon, Row, RowGroupLabel, Keycaps, SearchField, Text } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import {
  endSearch, setSearchQuery, startSearch, useSearchActive, useSearchQuery,
} from '@shared/stores/searchStore';
import { ActivityTray, ActivityButton } from '@shared/components';
import { shortcutKeys } from '@features/shortcuts';
import { startNewChat, useChatStore } from '@features/chat';
import type { UnifiedSidebarItem } from '@shared/types';
import { DestinationRow } from './DestinationRow';
import { useDestinations } from '@features/layout/hooks/useDestinations';

interface SidebarProps {
  shouldOffsetMacControls: boolean;
  /** `column` (Mac): window sidebar with its header and rows. `sheet` (phone): the app name with Search and New chat at
   *  the top, Settings at the bottom. The list and search are the same. */
  variant?: 'column' | 'sheet';
}

export const Sidebar: React.FC<SidebarProps> = ({
  shouldOffsetMacControls,
  variant = 'column',
}) => {
  const { open: isLeftPanelOpen, setLeftPanel } = useLeftPanel();
  const isSmallScreen = useSmallScreen();
  const currentView = useCurrentView();
  const isSettingsView = currentView === 'settings';
  const { items, isLoading, hasMore, loadingMore, loadMore } = useUnifiedSidebar();
  const selectedHistoryId = useSelectedHistoryId();
  const { openSettings, leaveSettings } = useAppActions();
  const currentChatId = useChatStore((s) => s.currentSessionId);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const openSession = useOpenSession();
  const searchActive = useSearchActive();
  const query = useSearchQuery();
  // The sheet (iPhone) searches in place; a column sidebar's search is the ⌘K command palette (CommandPalette), so it never searches here.
  const sheet = variant === 'sheet';
  const search = useSessionSearch(items, sheet ? query : '');
  const results = search.matches?.map((match) => match.item) ?? null;

  // Scroll the selected item into view when selection changes (e.g. from the ⌘K palette)
  useEffect(() => {
    if (!selectedHistoryId || !listContainerRef.current) return;
    const chatId = currentChatId;
    const itemType = chatId ? 'chat' : 'meeting';
    const itemId = chatId || selectedHistoryId;
    const el = listContainerRef.current.querySelector(`[data-sidebar-id="${itemType}-${itemId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedHistoryId, currentChatId]);

  const handleHomeClick = () => {
    startNewChat();
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSettingsClick = () => {
    openSettings();
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSelectItem = useCallback(async (item: UnifiedSidebarItem) => {
    await openSession(item);
    endSearch();
    if (isSmallScreen) setLeftPanel(false);
  }, [isSmallScreen, setLeftPanel, openSession]);

  // A chat or meeting is highlighted only while it is what's on screen (not under To-dos or Upcoming).
  const getSelectedId = (): string | null => {
    if (currentView !== 'home') return null;
    if (selectedHistoryId) return selectedHistoryId;
    if (currentChatId) return currentChatId;
    return null;
  };

  // The app's own places above Recents, the same on both platforms: To-dos always, Upcoming while the calendar is on.
  const destinations = useDestinations().map(({ view, icon, label }) => <DestinationRow key={view} view={view} icon={icon} label={label} prominent={sheet} />);

  // One list: the recents, or (iPhone, while searching) the matches with their words highlighted.
  const list = (
    <>
      <RowGroupLabel>{results ? 'Results' : 'Recents'}</RowGroupLabel>
      <UnifiedList
        items={results ?? items}
        selectedId={getSelectedId()}
        onSelect={handleSelectItem}
        searchQuery={results ? query : ''}
        paging={results ? undefined : { loading: isLoading, hasMore, loadingMore, loadMore }}
      />
    </>
  );
  const searchField = (
    <SearchField
      value={query}
      onChange={setSearchQuery}
      onCancel={endSearch}
      placeholder="Search"
      autoFocus
      busy={search.searching}
      className="flex-1"
    />
  );

  if (sheet) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <header className="flex min-h-14 shrink-0 items-center gap-2 px-4 pt-2 pb-3">
          {searchActive ? (
            <>
              {searchField}
              <Button variant="link" size="inline" onClick={endSearch}>Cancel</Button>
            </>
          ) : (
            <>
              <AppMark size="md" />
              <Text as="h1" variant="title" className="flex-1">{APP_CONFIG.name}</Text>
              <IconButton icon={Search} size="fab" variant="bar" onClick={startSearch} label="Search" />
              <IconButton icon={SquarePen} size="fab" variant="bar" onClick={handleHomeClick} label="New chat" />
            </>
          )}
        </header>
        <div className="shrink-0 px-2">{destinations}</div>
        <FadeScroll ref={listContainerRef} fill className="flex-1 px-2 pb-2">{list}</FadeScroll>
        {/* Bottom right, under Search and New chat: Activity while work runs (downloads, model loads), then Settings. */}
        <footer className="flex shrink-0 items-center justify-end gap-2 px-4 pt-2 pb-4">
          <ActivityButton />
          <IconButton icon={Settings} size="fab" variant="bar" onClick={handleSettingsClick} label="Settings" />
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header — icon buttons aligned with the macOS traffic lights */}
      <div className={LAYOUT.sidebarHeader}>
        {!isSettingsView && <IconButton icon={SquarePen} size="sm" onClick={handleHomeClick} label="New chat" />}
        <IconButton
          icon={PanelLeft}
          size="sm"
          onClick={() => setLeftPanel(!isLeftPanelOpen)}
          label={isLeftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        />
      </div>

      {/* Fixed above the scroll: the app (its mark and name; a new chat, like the pen), then Search, or the way back out in settings */}
      <div className="shrink-0 px-2">
        <Row onClick={handleHomeClick} aria-label={`${APP_CONFIG.name}: new chat`}>
          <AppMark size="lg" />
          <Text variant="title">{APP_CONFIG.name}</Text>
        </Row>
        {isSettingsView ? (
          <Row onClick={leaveSettings}>
            <Icon icon={ChevronLeft} size="xs" className="shrink-0" />
            <span className="flex-1">Back to App</span>
            <Keycaps keys={shortcutKeys('leaveSettings')} />
          </Row>
        ) : (
          <Row onClick={startSearch}>
            <Icon icon={Search} size="xs" className="shrink-0" />
            <span className="flex-1">Search</span>
            <Keycaps keys={shortcutKeys('search')} />
          </Row>
        )}
      </div>

      {/* Everything between Search and Settings scrolls; an edge fades only while there is more beyond it */}
      <FadeScroll ref={listContainerRef} fill className="flex-1 px-2 pb-1">
        {isSettingsView ? (
          <>
            <RowGroupLabel>Settings</RowGroupLabel>
            <SettingsNav />
          </>
        ) : (
          <>
            {destinations}
            {list}
          </>
        )}
      </FadeScroll>

      {/* Activity tray — transient, only visible when operations are in progress */}
      <ActivityTray />

      {/* Settings entry — absent in settings, where the top row leads back out */}
      {!isSettingsView && (
        <div className="shrink-0 px-2 pb-2">
          <Row onClick={handleSettingsClick}>
            <Icon icon={Settings} size="xs" className="shrink-0" />
            <span className="flex-1">Settings</span>
          </Row>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
