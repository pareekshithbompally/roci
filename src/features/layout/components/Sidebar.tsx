/** Left sidebar: search, actions, unified history/chat list, and settings button. */

import React, { useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useSelectedHistoryId, useCurrentView, useAppActions } from '@shared/stores/appStore';
import { UnifiedList } from '@features/history';
import { SettingsNav } from '@features/settings/components/SettingsNav';
import { useOpenMeeting, useSessionSearch, useUnifiedSidebar } from '@features/history/hooks';
import { AppStatus } from '@shared/types';
import { LAYOUT } from '@config/layout.config';
import { Button, IconButton, Icon, Row, RowGroupLabel, Kbd, SearchField, Text } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import {
  endSidebarSearch, setSidebarSearchQuery, startSidebarSearch, useSidebarSearchActive, useSidebarSearchQuery,
} from '@shared/stores/sidebarSearchStore';
import { ActivityTray } from '@shared/components';
import { shortcutLabel } from '@features/shortcuts';
import { startNewChat, useChatStore } from '@features/chat';
import type { UnifiedSidebarItem } from '@shared/types';

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
  const { items } = useUnifiedSidebar();
  const selectedHistoryId = useSelectedHistoryId();
  const { setCurrentView, openSettings, leaveSettings, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const currentChatId = useChatStore((s) => s.currentSessionId);
  const selectSession = useChatStore((s) => s.selectSession);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const openMeeting = useOpenMeeting();
  const searchActive = useSidebarSearchActive();
  const query = useSidebarSearchQuery();
  const search = useSessionSearch(items, query);

  // Scroll the selected item into view when selection changes (e.g. from spotlight)
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
    if (item.type === 'meeting' && item.historyItem) {
      await openMeeting(item.historyItem);
    } else if (item.type === 'chat') {
      selectSession(item.id);
      setCurrentView('home');
      setSelectedHistoryId(null);
      setResult(null);
      setStatus(AppStatus.CHAT);
    }
    endSidebarSearch();
    if (isSmallScreen) setLeftPanel(false);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus, selectSession, isSmallScreen, setLeftPanel, openMeeting]);

  const getSelectedId = (): string | null => {
    if (selectedHistoryId) return selectedHistoryId;
    if (currentChatId) return currentChatId;
    return null;
  };

  // One list: the recents, or while searching the matches (words highlighted).
  const list = (
    <>
      <RowGroupLabel>{search.matches ? 'Results' : 'Recents'}</RowGroupLabel>
      <UnifiedList items={search.matches ?? items} selectedId={getSelectedId()} onSelect={handleSelectItem} searchQuery={search.matches ? query : ''} />
    </>
  );
  const searchField = (
    <SearchField
      value={query}
      onChange={setSidebarSearchQuery}
      onCancel={endSidebarSearch}
      placeholder="Search meetings and chats"
      autoFocus
      busy={search.searching}
      className="flex-1"
    />
  );

  if (variant === 'sheet') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <header className="flex min-h-14 shrink-0 items-center gap-2 px-4 pt-2 pb-3">
          {searchActive ? (
            <>
              {searchField}
              <Button variant="link" size="inline" onClick={endSidebarSearch}>Cancel</Button>
            </>
          ) : (
            <>
              <Text as="h1" variant="title" className="flex-1">{APP_CONFIG.name}</Text>
              <IconButton icon={Search} size="fab" variant="bar" onClick={startSidebarSearch} label="Search" />
              <IconButton icon={SquarePen} size="fab" variant="bar" onClick={handleHomeClick} label="New chat" />
            </>
          )}
        </header>
        <div ref={listContainerRef} className="flex-1 overflow-y-auto px-2 pb-2">{list}</div>
        <ActivityTray />
        <footer className="shrink-0 px-4 pt-2 pb-4">
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

      {/* Top row — Search in the app; the way back out in settings */}
      <div className="shrink-0 px-2">
        {isSettingsView ? (
          <Row onClick={leaveSettings}>
            <Icon icon={ChevronLeft} size="xs" className="shrink-0" />
            <span className="flex-1">Back to app</span>
            <Kbd>{shortcutLabel('leaveSettings')}</Kbd>
          </Row>
        ) : (
          searchActive ? searchField : (
            <Row onClick={startSidebarSearch}>
              <Icon icon={Search} size="xs" className="shrink-0" />
              <span className="flex-1">Search</span>
              <Kbd>{shortcutLabel('search')}</Kbd>
            </Row>
          )
        )}
      </div>

      {/* Scrollable list — settings sections when in settings view */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto px-2 pb-1 scrollbar-overlay scroll-fade">
        {isSettingsView ? (
          <>
            <RowGroupLabel>Settings</RowGroupLabel>
            <SettingsNav />
          </>
        ) : (
          <>
            {list}
          </>
        )}
      </div>

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
