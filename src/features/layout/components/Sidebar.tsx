/**
 * Sidebar Component
 *
 * Left sidebar with search, action buttons, unified history/chat list, and settings button.
 */

import React, { useRef } from 'react';
import { Search, AudioWaveform, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@/hooks/useLeftPanel';
import { useSmallScreen } from '@/hooks/useMediaQuery';
import { useApp } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { useRecordingContext } from '@features/recording';
import { UnifiedList } from '@features/history';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { AppStatus } from '@/types';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { formatShortcut } from '@config/shortcuts.config';
import type { UnifiedSidebarItem } from '@/types';

interface SidebarProps {
  shouldOffsetMacControls: boolean;
  onChatOpen?: () => void;
  onSearchClick?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  shouldOffsetMacControls,
  onSearchClick,
  fileInputRef: externalFileInputRef
}) => {
  const { open: isLeftPanelOpen, setLeftPanel } = useLeftPanel();
  const isSmallScreen = useSmallScreen();
  const { items } = useUnifiedSidebar();
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult, selectedHistoryId } = useApp();
  const chat = useChat();
  const recording = useRecordingContext();
  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = externalFileInputRef || internalFileInputRef;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
    if (isSmallScreen) setLeftPanel(false);
  };

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

  const handleSelectItem = (item: UnifiedSidebarItem) => {
    if (item.type === 'meeting' && item.historyItem) {
      setCurrentView('home');
      setResult(item.historyItem);
      setSelectedHistoryId(item.historyItem.id);
      chat.setCurrentSessionId(null);
      setStatus(AppStatus.RESULTS);
    } else if (item.type === 'chat' && item.chatSession) {
      chat.selectSession(item.chatSession.id);
      setCurrentView('home');
      setSelectedHistoryId(null);
      setResult(null);
      setStatus(AppStatus.CHAT);
    }
    if (isSmallScreen) setLeftPanel(false);
  };

  const getSelectedId = (): string | null => {
    if (selectedHistoryId) return selectedHistoryId;
    if (chat.currentSessionId) return chat.currentSessionId;
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header area — h-[60px] to clear macOS traffic lights at y:32 */}
      <div className="flex items-center h-[60px] shrink-0 px-2 justify-end">
        <button
          onClick={() => setLeftPanel(!isLeftPanelOpen)}
          aria-label={isLeftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`size-7 cursor-pointer flex items-center justify-center rounded-full ${SURFACE.hoverSubtle} transition-all duration-200 ease-in-out relative z-50`}
        >
          <PanelLeft className={`w-4 h-4 ${TEXT.muted}`} />
        </button>
      </div>

      {/* Search trigger — opens spotlight overlay */}
      <div className={`px-3 pb-3 border-b ${BORDER.subtle}`}>
        <button
          onClick={onSearchClick}
          className={`w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 ${SURFACE.input} border ${BORDER.input} rounded-lg text-[13px] ${TEXT.faint} ${SURFACE.hoverSubtle} transition-all cursor-pointer`}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className={COMPONENT.kbdBadge}>{formatShortcut('CommandOrControl+K')}</kbd>
        </button>
      </div>

      {/* New Chat Button */}
      <div className="px-3 pt-2 pb-1">
        <button
          onClick={handleHomeClick}
          className={`w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all text-[13px] ${TEXT.secondary} ${SURFACE.hoverSubtle}`}
        >
          <AudioWaveform className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Unified list (meetings + chats) */}
      <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
        <UnifiedList
          items={items}
          selectedId={getSelectedId()}
          onSelect={handleSelectItem}
          searchQuery=""
        />
      </div>

      {/* Settings button */}
      <div className={`p-3 border-t ${BORDER.subtle}`}>
        <button
          onClick={handleSettingsClick}
          className={`w-full px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-all text-[13px] ${TEXT.secondary} ${SURFACE.hoverSubtle}`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
