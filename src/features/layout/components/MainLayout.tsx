/**
 * MainLayout Component
 *
 * Main application layout with resizable sidebar, content area, and resizable chat panel.
 * Both sidebar and chat panel are draggable via resize handles on their edges.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useRightPanel } from '@shared/hooks/useRightPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useAppStatus, useSelectedHistoryId, useMeetingChatOpen, useAppResult, useAppActions } from '@shared/stores/appStore';
import { useActivityItems } from '@shared/stores/activityStore';
import { Sidebar } from './Sidebar';
import { ChatPanel, startNewChat } from '@features/chat';
import { PanelLeft, SquarePen } from 'lucide-react';
import { IS_MACOS } from '@platform/index';
import { AppStatus } from '@shared/types';
import { LAYOUT } from '@config/layout.config';
import { UI_CONFIG } from '@config/ui.config';
import { Badge, Button, Icon, Separator, Surface } from '@shared/ui';

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
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const meetingChatOpen = useMeetingChatOpen();
  const result = useAppResult();
  const { setMeetingChatOpen } = useAppActions();
  const activityItems = useActivityItems();
  const dragRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);

  const activityCount = useMemo(() => activityItems.length, [activityItems]);

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

  const leftPanelShellClassName = `overflow-hidden ${
    isSmallScreen
      ? 'fixed inset-y-0 left-0 h-full z-50 px-1 w-full md:w-72'
      : isLeftPanelOpen
        ? `shrink-0 ${LAYOUT.sidebarShell}`
        : 'w-0 shrink-0 m-0'
  } ${
    isLeftPanelOpen
      ? 'opacity-100 visible'
      : 'opacity-0 invisible pointer-events-none'
  }`;

  return (
    <Surface as="main" variant="page" className="relative h-screen overflow-hidden">
      {/* Transparent drag strip over the titlebar safe area (geometry from
          UI_CONFIG.layout.titlebar so content padding and drag region agree). */}
      <div
        className="fixed w-full z-20 select-none"
        style={{ top: UI_CONFIG.layout.titlebar.dragOffset, height: UI_CONFIG.layout.titlebar.dragHeight }}
        data-tauri-drag-region
      />

      {/* Mobile Sidebar Overlay */}
      {isSmallScreen && isLeftPanelOpen && (
        <Surface
          variant="scrim"
          className="fixed inset-0 z-40 animate-fade-in"
          onClick={() => setLeftPanel(false)}
        />
      )}

      {/* Main layout */}
      <div className="flex h-full">
        {/* Left sidebar — resizable desktop panel */}
        {isLeftPanelOpen && !isSmallScreen && (
          <div className={`shrink-0 relative z-30 ${LAYOUT.sidebarShell}`} style={{ width: sidebarWidth }}>
            <Surface as="aside" variant="sidebar" className="h-full w-full overflow-hidden">
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onSearchClick={onSearchClick}
              />
            </Surface>
            {/* Resize handle */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-40 group"
            >
              <Separator orientation="vertical" className="h-full ml-auto opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
            </div>
          </div>
        )}

        {/* Mobile sidebar overlay */}
        {isSmallScreen && isLeftPanelOpen && (
          <aside className={leftPanelShellClassName}>
            <Surface variant="sidebar" className="h-full w-full overflow-hidden">
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onSearchClick={onSearchClick}
              />
            </Surface>
          </aside>
        )}

        {/* Main content panel */}
        <div className="h-full flex flex-1 min-w-0">
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
            {/* Sidebar actions when collapsed — traffic lights center at ~y:20px, button is 32px tall */}
            {!isLeftPanelOpen && !isSmallScreen && (
              <div className={`absolute top-3.5 z-50 flex items-center gap-1 ${
                shouldOffsetMacControls ? LAYOUT.collapsedControls : LAYOUT.collapsedControlsFlush
              }`}>
                <Button variant="ghost" size="icon" onClick={startNewChat} aria-label="New chat">
                  <Icon icon={SquarePen} size="sm" />
                </Button>
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLeftPanel(true)}
                    aria-label="Toggle sidebar"
                  >
                    <Icon icon={PanelLeft} size="sm" />
                  </Button>
                  {activityCount > 0 && (
                    <Badge
                      variant="warning"
                      solid
                      className="absolute -top-1 -right-1 pointer-events-none"
                      aria-label={`${activityCount} active operation${activityCount > 1 ? 's' : ''}`}
                    >
                      {activityCount > 9 ? '9+' : activityCount}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {children}
          </div>

          {/* Right chat panel — resizable, clears the same drag strip */}
          {showChatPanel && (
            <div
              className="shrink-0 h-full relative"
              style={{ width: rightPanelWidth }}
            >
              {/* Resize handle — left edge */}
              <div
                onMouseDown={(e) => handleResizeStart(e, 'right')}
                className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-40 group"
              >
                <Separator orientation="vertical" className="h-full opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
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
    </Surface>
  );
};

export default MainLayout;
