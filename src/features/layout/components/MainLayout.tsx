/**
 * MainLayout Component
 *
 * Main application layout with resizable sidebar, content area, and resizable chat panel.
 * Both sidebar and chat panel are draggable via resize handles on their edges.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import { useLeftPanel } from '@/hooks/useLeftPanel';
import { useRightPanel } from '@shared/hooks/useRightPanel';
import { useSmallScreen } from '@/hooks/useMediaQuery';
import { useApp } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { useActivityItems } from '@shared/stores/activityStore';
import { Sidebar } from './Sidebar';
import { ChatPanel } from '@features/chat';
import { PanelLeft, SquarePen } from 'lucide-react';
import { IS_MACOS } from '@platform/index';
import { AppStatus } from '@/types';
import { SURFACE, TEXT, LAYOUT, COMPONENT } from '@config/theme.config';
import { UI_CONFIG } from '@config/ui.config';

interface MainLayoutProps {
  children: React.ReactNode;
  onSearchClick?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  onSearchClick,
}) => {
  const { open: isLeftPanelOpen, setLeftPanel, width: sidebarWidth, setLeftPanelWidth } = useLeftPanel();
  const { width: rightPanelWidth, setRightPanelWidth } = useRightPanel();
  const isSmallScreen = useSmallScreen();
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult, meetingChatOpen, setMeetingChatOpen, status, selectedHistoryId, result } = useApp();
  const chat = useChat();
  const activityItems = useActivityItems();
  const dragRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);

  const activityCount = useMemo(() => activityItems.length, [activityItems]);

  const handleNewChat = useCallback(() => {
    setCurrentView('home');
    setSelectedHistoryId(null);
    chat.setCurrentSessionId(null);
    setResult(null);
    setStatus(AppStatus.IDLE);
  }, [setCurrentView, setSelectedHistoryId, chat, setResult, setStatus]);

  /** Shared resize handler for both left and right panels */
  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    const startWidth = side === 'left' ? sidebarWidth : rightPanelWidth;
    dragRef.current = { startX: e.clientX, startWidth, side };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      if (dragRef.current.side === 'left') {
        setLeftPanelWidth(dragRef.current.startWidth + delta);
      } else {
        // Right panel: dragging left increases width
        setRightPanelWidth(dragRef.current.startWidth - delta);
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth]);

  const shouldOffsetMacControls = IS_MACOS && (isSmallScreen || !isLeftPanelOpen);

  const showChatPanel = meetingChatOpen && selectedHistoryId && status === AppStatus.RESULTS;

  const leftPanelShellClassName = `${TEXT.primary} overflow-hidden ${
    isSmallScreen
      ? 'fixed inset-y-0 left-0 h-full pb-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-top))] z-50 px-1 w-full md:w-72'
      : isLeftPanelOpen
        ? `shrink-0 ${LAYOUT.sidebarShell}`
        : 'w-0 shrink-0 m-0'
  } ${
    isLeftPanelOpen
      ? 'opacity-100 visible'
      : 'opacity-0 invisible pointer-events-none'
  }`;

  const leftPanelInnerClassName =
    `${LAYOUT.sidebarInner} ${LAYOUT.sidebarInnerBg}`;

  return (
    <main className={`relative h-screen ${SURFACE.page} ${TEXT.primary} overflow-hidden`}>
      {/* Invisible drag region for window dragging — covers title bar area.
          top-[4px] leaves room for macOS native resize edge to avoid simultaneous move+resize. */}
      <div className="fixed w-full top-[4px] h-[36px] z-20 select-none" data-tauri-drag-region />

      {/* Mobile Sidebar Overlay */}
      {isSmallScreen && isLeftPanelOpen && (
        <div
          className={`fixed inset-0 z-40 ${SURFACE.overlay} animate-fade-in`}
          onClick={() => setLeftPanel(false)}
        />
      )}

      {/* Main layout */}
      <div className="flex h-full">
        {/* Left sidebar — resizable desktop panel */}
        {isLeftPanelOpen && !isSmallScreen && (
          <div className={`shrink-0 relative z-30 ${LAYOUT.sidebarShell}`} style={{ width: sidebarWidth }}>
            <aside className={leftPanelInnerClassName}>
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onSearchClick={onSearchClick}
              />
            </aside>
            {/* Resize handle */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-40 group"
            >
              <div className={`w-px h-full ml-auto opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity ${COMPONENT.resizeHandle}`} />
            </div>
          </div>
        )}

        {/* Mobile sidebar overlay */}
        {isSmallScreen && isLeftPanelOpen && (
          <aside className={leftPanelShellClassName}>
            <div className={leftPanelInnerClassName}>
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onSearchClick={onSearchClick}
              />
            </div>
          </aside>
        )}

        {/* Main content panel */}
        <div className="h-full flex flex-1 min-w-0">
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pt-[40px] relative">
            {/* Sidebar actions when collapsed — traffic lights center at ~y:20px, button is 32px tall */}
            {!isLeftPanelOpen && !isSmallScreen && (
              <div className={`absolute top-[14px] z-50 flex items-center gap-1 ${
                shouldOffsetMacControls ? 'left-[88px]' : 'left-3'
              }`}>
                <button
                  onClick={handleNewChat}
                  className={COMPONENT.iconButton}
                  aria-label="New chat"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setLeftPanel(true)}
                    className={COMPONENT.iconButton}
                    aria-label="Toggle sidebar"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                  {activityCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none px-0.5 pointer-events-none"
                      aria-label={`${activityCount} active operation${activityCount > 1 ? 's' : ''}`}
                    >
                      {activityCount > 9 ? '9+' : activityCount}
                    </span>
                  )}
                </div>
              </div>
            )}
            {children}
          </div>

          {/* Right chat panel — resizable, with pt-[60px] to clear drag region */}
          {showChatPanel && (
            <div className="shrink-0 h-full pt-[40px] relative" style={{ width: rightPanelWidth }}>
              {/* Resize handle — left edge */}
              <div
                onMouseDown={(e) => handleResizeStart(e, 'right')}
                className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-40 group"
              >
                <div className={`w-px h-full opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity ${COMPONENT.resizeHandle}`} />
              </div>
              <ChatPanel
                meetingId={selectedHistoryId}
                meetingTitle={result?.title || 'Meeting'}
                onClose={() => setMeetingChatOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default MainLayout;
