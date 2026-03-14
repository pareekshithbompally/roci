/**
 * MainLayout Component
 *
 * Main application layout with resizable sidebar, content area, and chat panel.
 * Implements resizable panels with auto-collapse.
 */

import React from 'react';
import { useLeftPanel } from '@/hooks/useLeftPanel';
import { useSmallScreen } from '@/hooks/useMediaQuery';
import { Sidebar } from './Sidebar';
import { ChatPanel } from '@features/chat';
import { PanelLeft } from 'lucide-react';
import { IS_MACOS } from '@platform/index';
import { SURFACE, TEXT, LAYOUT, COMPONENT } from '@config/theme.config';

interface MainLayoutProps {
  children: React.ReactNode;
  isChatOpen: boolean;
  onChatToggle: () => void;
  onSearchClick?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  isChatOpen,
  onChatToggle,
  onSearchClick,
}) => {
  const { open: isLeftPanelOpen, setLeftPanel, size: leftPanelSize } = useLeftPanel();
  const isSmallScreen = useSmallScreen();

  const shouldOffsetMacControls = IS_MACOS && (isSmallScreen || !isLeftPanelOpen);

  const leftPanelShellClassName = `${TEXT.primary} overflow-hidden ${
    isSmallScreen
      ? 'fixed inset-y-0 left-0 h-full pb-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-top))] z-50 px-1 w-full md:w-72'
      : isLeftPanelOpen
        ? `w-72 shrink-0 ${LAYOUT.sidebarShell}`
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
      {/* Invisible drag region for window dragging — covers title bar area */}
      <div className="fixed w-full h-[60px] z-20 top-0" data-tauri-drag-region />

      {/* Mobile Sidebar Overlay */}
      {isSmallScreen && isLeftPanelOpen && (
        <div
          className={`fixed inset-0 z-40 ${SURFACE.overlay} animate-fade-in`}
          onClick={() => setLeftPanel(false)}
        />
      )}

      {/* Main layout */}
      <div className="flex h-full">
        {/* Left sidebar — floating panel like Jan AI */}
        {isLeftPanelOpen && !isSmallScreen && (
          <div className={`shrink-0 ${LAYOUT.sidebarShell}`} style={{ width: `${leftPanelSize}%` }}>
            <aside className={leftPanelInnerClassName}>
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onChatOpen={onChatToggle}
                onSearchClick={onSearchClick}
              />
            </aside>
          </div>
        )}

        {/* Mobile sidebar overlay */}
        {isSmallScreen && isLeftPanelOpen && (
          <aside className={leftPanelShellClassName}>
            <div className={leftPanelInnerClassName}>
              <Sidebar
                shouldOffsetMacControls={shouldOffsetMacControls}
                onChatOpen={onChatToggle}
                onSearchClick={onSearchClick}
              />
            </div>
          </aside>
        )}

        {/* Main content panel */}
        <div className="h-full flex flex-1 min-w-0">
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pt-[60px] relative">
            {/* Sidebar toggle when collapsed */}
            {!isLeftPanelOpen && !isSmallScreen && (
              <button
                onClick={() => setLeftPanel(true)}
                className={`absolute top-4 z-50 ${COMPONENT.iconButton} ${
                  shouldOffsetMacControls ? 'left-[88px]' : 'left-3'
                }`}
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            {children}
          </div>
          {isChatOpen && (
            <div className="w-[520px] shrink-0 h-full">
              <ChatPanel isOpen={isChatOpen} onClose={onChatToggle} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default MainLayout;
