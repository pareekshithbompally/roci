/** Left sidebar: search, actions, unified history/chat list, and settings button. */

import React, { useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useSelectedHistoryId, useCurrentView, useAppActions } from '@shared/stores/appStore';
import { useChat } from '@shared/contexts/ChatContext';
import { UnifiedList } from '@features/history';
import { SettingsNav } from '@features/settings/components/SettingsNav';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { AppStatus } from '@shared/types';
import { LAYOUT } from '@config/layout.config';
import { IconButton, Icon, Row, RowGroupLabel, Kbd } from '@shared/ui';
import { ActivityTray } from '@shared/components';
import { shortcutLabel } from '@features/shortcuts';
import { startNewChat } from '@features/chat';
import type { UnifiedSidebarItem } from '@shared/types';
import { useOpenMeeting } from '@shared/hooks/useOpenMeeting';

interface SidebarProps {
  shouldOffsetMacControls: boolean;
  onSearchClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  shouldOffsetMacControls,
  onSearchClick,
}) => {
  const { open: isLeftPanelOpen, setLeftPanel } = useLeftPanel();
  const isSmallScreen = useSmallScreen();
  const currentView = useCurrentView();
  const isSettingsView = currentView === 'settings';
  const { items } = useUnifiedSidebar();
  const selectedHistoryId = useSelectedHistoryId();
  const { setCurrentView, leaveSettings, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const chat = useChat();
  const listContainerRef = useRef<HTMLDivElement>(null);
  const openMeeting = useOpenMeeting();

  // Scroll the selected item into view when selection changes (e.g. from spotlight)
  useEffect(() => {
    if (!selectedHistoryId || !listContainerRef.current) return;
    const chatId = chat.currentSessionId;
    const itemType = chatId ? 'chat' : 'meeting';
    const itemId = chatId || selectedHistoryId;
    const el = listContainerRef.current.querySelector(`[data-sidebar-id="${itemType}-${itemId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedHistoryId, chat.currentSessionId]);

  const handleHomeClick = () => {
    startNewChat();
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSettingsClick = () => {
    setCurrentView('settings');
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSelectItem = useCallback(async (item: UnifiedSidebarItem) => {
    if (item.type === 'meeting' && item.historyItem) {
      await openMeeting(item.historyItem);
    } else if (item.type === 'chat') {
      chat.selectSession(item.id);
      setCurrentView('home');
      setSelectedHistoryId(null);
      setResult(null);
      setStatus(AppStatus.CHAT);
    }
    if (isSmallScreen) setLeftPanel(false);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus, chat, isSmallScreen, setLeftPanel, openMeeting]);

  const getSelectedId = (): string | null => {
    if (selectedHistoryId) return selectedHistoryId;
    if (chat.currentSessionId) return chat.currentSessionId;
    return null;
  };

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
          <Row onClick={onSearchClick}>
            <Icon icon={Search} size="xs" className="shrink-0" />
            <span className="flex-1">Search</span>
            <Kbd>{shortcutLabel('search')}</Kbd>
          </Row>
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
            <RowGroupLabel>Recents</RowGroupLabel>
            <UnifiedList
              items={items}
              selectedId={getSelectedId()}
              onSelect={handleSelectItem}
              searchQuery=""
            />
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
