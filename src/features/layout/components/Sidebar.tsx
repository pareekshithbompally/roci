/**
 * Sidebar Component
 *
 * Left sidebar with search, action buttons, unified history/chat list, and settings button.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useSelectedHistoryId, useCurrentView, useAppActions } from '@shared/stores/appStore';
import { useChat } from '@shared/contexts/ChatContext';
import { UnifiedList } from '@features/history';
import { SettingsNav } from '@features/settings/components/SettingsNav';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { AppStatus } from '@shared/types';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { ActivityTray } from '@shared/components/ActivityTray';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { formatShortcut } from '@config/shortcuts.config';
import type { UnifiedSidebarItem } from '@shared/types';
import { useMeetingDetailLoader } from '@shared/hooks/useMeetingDetailLoader';

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
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const chat = useChat();
  const listContainerRef = useRef<HTMLDivElement>(null);
  const loadMeetingDetail = useMeetingDetailLoader();

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
    setCurrentView('home');
    setSelectedHistoryId(null);
    chat.setCurrentSessionId(null);
    setResult(null);
    setStatus(AppStatus.IDLE);
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSettingsClick = () => {
    setCurrentView('settings');
    if (isSmallScreen) setLeftPanel(false);
  };

  const handleSelectItem = useCallback(async (item: UnifiedSidebarItem) => {
    if (item.type === 'meeting' && item.historyItem) {
      const hi = item.historyItem;
      setCurrentView('home');
      setSelectedHistoryId(hi.id);
      chat.setCurrentSessionId(null);

      await loadMeetingDetail(hi);

      setStatus(AppStatus.RESULTS);
    } else if (item.type === 'chat') {
      chat.selectSession(item.id);
      setCurrentView('home');
      setSelectedHistoryId(null);
      setResult(null);
      setStatus(AppStatus.CHAT);
    }
    if (isSmallScreen) setLeftPanel(false);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus, chat, isSmallScreen, setLeftPanel, loadMeetingDetail]);

  const getSelectedId = (): string | null => {
    if (selectedHistoryId) return selectedHistoryId;
    if (chat.currentSessionId) return chat.currentSessionId;
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header — flush to top of sidebar inner panel */}
      <div className="flex items-center shrink-0 px-1 pt-[7px] pb-2 justify-end gap-0.5">
        <button
          onClick={handleHomeClick}
          aria-label="New chat"
          className={`p-1.5 cursor-pointer flex items-center justify-center rounded-lg ${SURFACE.hoverSubtle} transition-all ${TEXT.muted}`}
        >
          <SquarePen className="w-4 h-4" />
        </button>
        <button
          onClick={() => setLeftPanel(!isLeftPanelOpen)}
          aria-label={isLeftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`p-1.5 cursor-pointer flex items-center justify-center rounded-lg ${SURFACE.hoverSubtle} transition-all ${TEXT.muted}`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search trigger — sticky above scrollable list */}
      <div className="shrink-0 px-2">
        <button
          onClick={onSearchClick}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md ${TYPOGRAPHY_CLASSES.sidebarItem} ${TEXT.primary} ${SURFACE.hoverSubtle} transition-all cursor-pointer`}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className={COMPONENT.kbdBadge}>{formatShortcut('CommandOrControl+K')}</kbd>
        </button>
      </div>

      {/* Scrollable list — settings sections when in settings view */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto px-2 py-1 scrollbar-overlay scroll-fade">
        {isSettingsView ? (
          <SettingsNav />
        ) : (
          <UnifiedList
            items={items}
            selectedId={getSelectedId()}
            onSelect={handleSelectItem}
            searchQuery=""
          />
        )}
      </div>

      {/* Activity tray — transient, only visible when operations are in progress */}
      <ActivityTray />

      {/* Settings button */}
      <div className={`shrink-0 px-2 py-1.5 border-t ${BORDER.subtle}`}>
        <button
          onClick={handleSettingsClick}
          aria-current={isSettingsView ? 'page' : undefined}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md ${TYPOGRAPHY_CLASSES.sidebarItem} ${TEXT.primary} transition-all cursor-pointer ${isSettingsView ? SURFACE.selected : SURFACE.hoverSubtle}`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
