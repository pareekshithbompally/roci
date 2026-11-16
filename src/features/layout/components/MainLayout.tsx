/** App layout: resizable sidebar, content area, and the floating meeting chat; a phone gets `PhoneShell`. */

import React, { useCallback, useRef, useMemo } from 'react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useAppStatus, useSelectedHistoryId, useAppResult } from '@shared/stores/appStore';
import { useActivityItems } from '@shared/stores/activityStore';
import { Sidebar } from './Sidebar';
import { MeetingChat, startNewChat } from '@features/chat';
import { PanelLeft, SquarePen } from 'lucide-react';
import { platform } from '@platform/index';
import { useFormFactor } from '@platform/formFactor';
import { PhoneShell } from './PhoneShell';
import { AppStatus } from '@shared/types';
import { LAYOUT } from '@config/layout.config';
import { Badge, Button, Icon, Separator, Surface, TitlebarDragRegion } from '@shared/ui';

interface MainLayoutProps {
  children: React.ReactNode;
  onSearchClick?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  onSearchClick,
}) => {
  const { open: isLeftPanelOpen, setLeftPanel, width: sidebarWidth, setLeftPanelWidth } = useLeftPanel();
  const isSmallScreen = useSmallScreen();
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const result = useAppResult();
  const activityItems = useActivityItems();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activityCount = useMemo(() => activityItems.length, [activityItems]);
  const formFactor = useFormFactor();

  /** Sidebar resize: drag the right edge */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setLeftPanelWidth(dragRef.current.startWidth + e.clientX - dragRef.current.startX);
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
  }, [sidebarWidth, setLeftPanelWidth]);

  const shouldOffsetMacControls = platform.hasWindowChrome && (isSmallScreen || !isLeftPanelOpen);

  // Meeting chat works on a selected meeting's results; it shows as its button or its window.
  const meetingChatAvailable = selectedHistoryId && status === AppStatus.RESULTS;

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

  if (formFactor === 'phone') return <PhoneShell onSearchClick={onSearchClick}>{children}</PhoneShell>;

  return (
    <Surface as="main" variant="page" className="relative h-screen overflow-hidden">
      <TitlebarDragRegion />

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
              onMouseDown={handleResizeStart}
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

          {meetingChatAvailable && (
            <MeetingChat meetingId={selectedHistoryId} meetingTitle={result?.title || 'Meeting'} />
          )}
        </div>
      </div>
    </Surface>
  );
};

export default MainLayout;
