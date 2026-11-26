/** Left sidebar: the app's mark and name and Search fixed at the top, the destinations and history scrolling under them
 *  (edges fade only while there is more), Settings fixed at the foot. */

import React, { useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useSelectedHistoryId, useCurrentView, useAppActions } from '@shared/stores/appStore';
import { UnifiedList } from '@features/history';
import { SettingsNav } from '@features/settings/components/SettingsNav';
import { useOpenSession, useUnifiedSidebar } from '@features/history/hooks';
import { LAYOUT } from '@config/layout.config';
import { AppMark, FadeScroll, IconButton, Icon, Row, RowGroupLabel, Keycaps, Text, motionFor } from '@shared/ui';
import { motion } from 'framer-motion';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { APP_CONFIG } from '@config/app.config';
import { SHELL_COPY } from '@config/shell.config';
import {
  endSearch, startSearch, useSearchActive, useSearchRound,
} from '@shared/stores/searchStore';
import { ActivityTray, ActivityButton } from '@shared/components';
import { shortcutKeys } from '@features/shortcuts';
import { startNewChat, useChatStore } from '@features/chat';
import type { UnifiedSidebarItem } from '@shared/types';
import { DestinationRow } from './DestinationRow';
import { useDestinations } from '@features/layout/hooks/useDestinations';

interface SidebarProps {
  shouldOffsetMacControls: boolean;
  /** `column` (Mac): window sidebar with its header and rows. `sheet` (phone): the app name and New chat fixed at the top,
   *  the places and recents scrolling under it, Search and Settings at the bottom. The list is the same. */
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
  const searchRound = useSearchRound();
  // Search is its own screen: iPhone's full-screen search (SearchScreen) from the magnifier, a column sidebar's ⌘K palette.
  const sheet = variant === 'sheet';

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

  // The phone's Settings opens over the sidebar, so ‹ comes back to it; a narrow Mac window's drawer closes under its page.
  const handleSettingsClick = () => {
    openSettings();
    if (isSmallScreen && !sheet) setLeftPanel(false);
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

  // The recents, paged as they scroll.
  const list = (
    <>
      <RowGroupLabel>{SHELL_COPY.recents}</RowGroupLabel>
      <UnifiedList
        items={items}
        selectedId={getSelectedId()}
        onSelect={handleSelectItem}
        searchQuery=""
        paging={{ loading: isLoading, hasMore, loadingMore, loadMore }}
      />
    </>
  );

  if (sheet) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <header className="flex min-h-14 shrink-0 items-center gap-2 px-4 pt-2 pb-3">
          <AppMark size="md" />
          <Text as="h1" variant="title" className="flex-1">{APP_CONFIG.name}</Text>
          <IconButton icon={SquarePen} size="fab" variant="bar" onClick={handleHomeClick} label={SHELL_COPY.newChat} />
        </header>
        {/* Only the app's name holds still; its places and the recents scroll together under it. */}
        <FadeScroll ref={listContainerRef} fill className="flex-1 px-2 pb-2">
          {destinations}
          {list}
        </FadeScroll>
        {/* Bottom right: Activity while work runs (downloads, model loads), Search, then Settings. Search grows out of its
            button into the full screen (SearchScreen shares its layout id), so the button leaves while the screen is open. */}
        <footer className="flex shrink-0 items-center justify-end gap-2 px-4 pt-2 pb-4">
          <ActivityButton />
          <div className="size-11">
            {!searchActive && (
              <motion.div layoutId={ANIMATION_CONFIG.search.morphId(searchRound)} transition={motionFor(ANIMATION_CONFIG.search.morph)}>
                <IconButton icon={Search} size="fab" variant="bar" onClick={startSearch} label={SHELL_COPY.search} />
              </motion.div>
            )}
          </div>
          <IconButton icon={Settings} size="fab" variant="bar" onClick={handleSettingsClick} label={SHELL_COPY.settings} />
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header — icon buttons aligned with the macOS traffic lights */}
      <div className={LAYOUT.sidebarHeader}>
        {!isSettingsView && <IconButton icon={SquarePen} size="sm" onClick={handleHomeClick} label={SHELL_COPY.newChat} />}
        <IconButton
          icon={PanelLeft}
          size="sm"
          onClick={() => setLeftPanel(!isLeftPanelOpen)}
          label={isLeftPanelOpen ? SHELL_COPY.collapseSidebar : SHELL_COPY.expandSidebar}
        />
      </div>

      {/* Fixed above the scroll: the app (its mark and name; a new chat, like the pen), then Search, or the way back out in settings */}
      <div className="shrink-0 px-2">
        <Row onClick={handleHomeClick} aria-label={SHELL_COPY.appNewChat(APP_CONFIG.name)}>
          <AppMark size="lg" />
          <Text variant="title">{APP_CONFIG.name}</Text>
        </Row>
        {isSettingsView ? (
          <Row onClick={leaveSettings}>
            <Icon icon={ChevronLeft} size="xs" className="shrink-0" />
            <span className="flex-1">{SHELL_COPY.backToApp}</span>
            <Keycaps keys={shortcutKeys('leaveSettings')} />
          </Row>
        ) : (
          <Row onClick={startSearch}>
            <Icon icon={Search} size="xs" className="shrink-0" />
            <span className="flex-1">{SHELL_COPY.search}</span>
            <Keycaps keys={shortcutKeys('search')} />
          </Row>
        )}
      </div>

      {/* Everything between Search and Settings scrolls; an edge fades only while there is more beyond it */}
      <FadeScroll ref={listContainerRef} fill className="flex-1 px-2 pb-1">
        {isSettingsView ? (
          <>
            <RowGroupLabel>{SHELL_COPY.settings}</RowGroupLabel>
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
            <span className="flex-1">{SHELL_COPY.settings}</span>
          </Row>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
