/** App layout: resizable sidebar, content area, and a meeting's floating +; a phone gets `PhoneShell`. */

import React, { useCallback, useRef, useMemo } from 'react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { useFloatingSidebarControls } from '@shared/hooks/useFloatingSidebarControls';
import { useActivityItems } from '@shared/stores/activityStore';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '@features/palette';
import { startNewChat } from '@features/chat';
import { PanelLeft, SquarePen } from 'lucide-react';
import { useFormFactor } from '@platform/formFactor';
import { PhoneShell } from './PhoneShell';
import { LAYOUT } from '@config/layout.config';
import { BackForward, Badge, Button, Drawer, Icon, Separator, Surface, TitlebarDragRegion } from '@shared/ui';
import { goBack, useReturnPoint } from '@shared/stores/returnStore';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
}) => {
  const { open: isLeftPanelOpen, setLeftPanel, width: sidebarWidth, setLeftPanelWidth } = useLeftPanel();
  const isSmallScreen = useSmallScreen();
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

  const shouldOffsetMacControls = useFloatingSidebarControls();
  const returnPoint = useReturnPoint();

  if (formFactor === 'phone') return <PhoneShell>{children}</PhoneShell>;

  return (
    <Surface as="main" variant="page" className="relative h-dvh overflow-hidden">
      <TitlebarDragRegion />

      {/* ⌘K: the command palette beside the column sidebar (the phone searches in its sidebar sheet). */}
      <CommandPalette />
      {/* Narrow window: the sidebar slides over the content (the same drawer as on a phone). */}
      <Drawer side="start" open={isSmallScreen && isLeftPanelOpen} onClose={() => setLeftPanel(false)} label="Sidebar">
        <Sidebar shouldOffsetMacControls={shouldOffsetMacControls} />
      </Drawer>

      {/* Main layout */}
      <div className="flex h-full">
        {/* Left sidebar — resizable desktop panel */}
        {isLeftPanelOpen && !isSmallScreen && (
          <div className={`shrink-0 relative z-30 ${LAYOUT.sidebarShell}`} style={{ width: sidebarWidth }}>
            <Surface as="aside" variant="sidebar" className="h-full w-full overflow-hidden">
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
               
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

        {/* Main content panel */}
        <div className="h-full flex flex-1 min-w-0">
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
            {/* Sidebar actions when collapsed — traffic lights center at ~y:20px, button is 32px tall — then the way back (the
                ‹ › capsule) when a place left one; with the sidebar open, the capsule alone at the content's leading edge. */}
            {(returnPoint || (!isLeftPanelOpen && !isSmallScreen)) && (
              <div className={`absolute top-3.5 z-50 flex items-center gap-1 ${
                shouldOffsetMacControls ? LAYOUT.collapsedControls : LAYOUT.collapsedControlsFlush
              }`}>
                {!isLeftPanelOpen && !isSmallScreen && (<>
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
                </>)}
                {returnPoint && <BackForward onBack={goBack} />}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </Surface>
  );
};

export default MainLayout;
