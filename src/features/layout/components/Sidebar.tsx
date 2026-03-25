/**
 * Sidebar Component
 *
 * Left sidebar with search, action buttons, unified history/chat list, and settings button.
 */

import React, { useRef, useCallback } from 'react';
import { Search, SquarePen, PanelLeft, Settings } from 'lucide-react';
import { useLeftPanel } from '@/hooks/useLeftPanel';
import { useSmallScreen } from '@/hooks/useMediaQuery';
import { useApp } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { useRecordingContext } from '@features/recording';
import { UnifiedList } from '@features/history';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { AppStatus } from '@/types';
import { meetingService } from '@/services/meeting.service';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { ActivityTray } from '@shared/components/ActivityTray';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { formatShortcut } from '@config/shortcuts.config';
import type { UnifiedSidebarItem } from '@/types';

interface SidebarProps {
  shouldOffsetMacControls: boolean;
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

  const handleSelectItem = useCallback(async (item: UnifiedSidebarItem) => {
    if (item.type === 'meeting' && item.historyItem) {
      const hi = item.historyItem;
      setCurrentView('home');
      setSelectedHistoryId(hi.id);
      chat.setCurrentSessionId(null);

      // If historyItem already has transcript/summary (e.g. from a fresh recording),
      // use it directly. Otherwise lazy-load full detail from disk.
      if (hi.transcript || hi.summary) {
        setResult(hi);
      } else {
        // Show results view immediately (loading state), then populate
        setResult({ title: hi.title, transcript: '', summary: '', categories: hi.categories });
        try {
          const detail = await meetingService.getMeetingDetail(hi.id);
          if (detail) {
            setResult({
              title: detail.index.title,
              transcript: detail.transcript?.text || '',
              summary: detail.summary
                ? `## Meeting Overview\n${detail.summary.overview}\n\n## Key Discussion Points\n${detail.summary.keyDiscussionPoints.map(p => `- ${p}`).join('\n')}\n\n## Decisions Made\n${detail.summary.decisionsMade.map(d => `- ${d}`).join('\n')}\n\n## Action Items\n${detail.summary.actionItems.map(a => `- ${a.text}${a.owner ? ` - Owner: ${a.owner}` : ''}${a.dueDate ? ` - Due: ${a.dueDate}` : ''}`).join('\n')}\n\n## Next Steps\n${detail.summary.nextSteps.map(s => `- ${s}`).join('\n')}`
                : '',
              categories: detail.index.categories,
              structuredSummary: detail.summary
                ? {
                    overview: detail.summary.overview,
                    keyDiscussionPoints: detail.summary.keyDiscussionPoints,
                    decisionsMade: detail.summary.decisionsMade,
                    actionItems: detail.summary.actionItems.map(a => ({
                      id: crypto.randomUUID(),
                      text: a.text,
                      owner: a.owner,
                      dueDate: a.dueDate,
                      completed: false,
                    })),
                    nextSteps: detail.summary.nextSteps,
                  }
                : undefined,
            });
          }
        } catch (error) {
          console.error('[Sidebar] Failed to load meeting detail:', error);
        }
      }

      setStatus(AppStatus.RESULTS);
    } else if (item.type === 'chat' && item.chatSession) {
      chat.selectSession(item.chatSession.id);
      setCurrentView('home');
      setSelectedHistoryId(null);
      setResult(null);
      setStatus(AppStatus.CHAT);
    }
    if (isSmallScreen) setLeftPanel(false);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus, chat, isSmallScreen, setLeftPanel]);

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

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar scroll-fade">
        <UnifiedList
          items={items}
          selectedId={getSelectedId()}
          onSelect={handleSelectItem}
          searchQuery=""
        />
      </div>

      {/* Activity tray — transient, only visible when operations are in progress */}
      <ActivityTray />

      {/* Settings button */}
      <div className="shrink-0 px-2 pb-1">
        <button
          onClick={handleSettingsClick}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md ${TYPOGRAPHY_CLASSES.sidebarItem} ${TEXT.primary} ${SURFACE.hoverSubtle} transition-all cursor-pointer`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
