/** iPhone shell: a plain chatbot — top bar (sidebar · model · New chat), the content; opening the sidebar slides the view aside
 *  to reveal it. A place from the sidebar (To-dos, Upcoming…) is a top-level screen like home: its own bar with the sidebar
 *  button, never ‹ (only what is opened from it has ‹). Settings opens full screen over everything, with ‹ back to where it
 *  was opened from and its pages drilling in. The model picker is a chat's, so only the chat screens show it. */

import React, { useState } from 'react';
import { PanelLeft, SquarePen } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useAppActions, useAppStatus, useAppStore, useCurrentView, useSelectedHistoryId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ModelPicker, startNewChat, useChatStore } from '@features/chat';
import { SettingsHome, settingsScreen } from '@features/settings';
import { IconButton, PresentedStack, RevealLayout, ShellBarContext, Surface, TopBar, ViewLeadingContext } from '@shared/ui';
import { SearchScreen } from '@features/palette';
import { Sidebar } from './Sidebar';
import { MeetingFab } from './MeetingFab';
import { SHELL_COPY } from '@config/shell.config';

interface PhoneShellProps {
  children: React.ReactNode;
}

export const PhoneShell: React.FC<PhoneShellProps> = ({ children }) => {
  const open = useLeftPanel((s) => s.open);
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const inSettings = useCurrentView() === 'settings';
  // What is on screen under Settings: the view it was opened from (App's content view), so opening Settings never swaps it.
  const view = useAppStore((s) => (s.currentView === 'settings' ? s.viewBeforeSettings : s.currentView));
  // A place from the sidebar: a top-level screen with its own bar.
  const place = view !== 'home';
  const status = useAppStatus();
  const chatting = status === AppStatus.IDLE || status === AppStatus.CHAT;
  // New chat only leaves something: hidden on a new chat already (no chat or meeting open).
  const sessionOpen = useChatStore((s) => s.currentSessionId) !== null;
  const historyOpen = useSelectedHistoryId() !== null;
  // The bar's trailing end: New chat in a chat; a meeting's own controls (its ⋯) on a meeting, sent up by its header.
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const { leaveSettings } = useAppActions();
  const settingsRequest = useAppStore((s) => s.settingsRequest);
  const settingsVisit = useAppStore((s) => s.settingsVisit);
  const sidebarButton = <IconButton icon={PanelLeft} size="fab" variant="bar" label={SHELL_COPY.openSidebar} onClick={() => setLeftPanel(true)} />;

  return (
    <>
    <RevealLayout open={open} onOpen={() => setLeftPanel(true)} onClose={() => setLeftPanel(false)} paneLabel="Sidebar" pane={<Sidebar variant="sheet" shouldOffsetMacControls={false} />}>
      <Surface as="main" variant="page" className="relative flex h-full flex-col overflow-hidden">
        {!place && (
          <TopBar
            leading={sidebarButton}
            title={chatting ? <ModelPicker compact bar /> : undefined}
            trailing={historyOpen
              ? <div ref={setBarSlot} className="flex items-center gap-1" />
              : sessionOpen && <IconButton icon={SquarePen} size="fab" variant="bar" label={SHELL_COPY.newChat} onClick={startNewChat} />}
          />
        )}
        {/* Clear of the home indicator once, for every screen; a place's bar carries the sidebar button. */}
        <ViewLeadingContext.Provider value={place ? sidebarButton : null}>
          <ShellBarContext.Provider value={historyOpen ? barSlot : null}>
            <div className="relative flex min-h-0 flex-1 flex-col pb-safe-bottom">
              {children}
            </div>
          </ShellBarContext.Provider>
          <MeetingFab />
        </ViewLeadingContext.Provider>
      </Surface>
    </RevealLayout>
    {/* Settings over the whole shell, sidebar included, so ‹ goes back to exactly what was there. Keyed by visit: each
        opening starts at its top (or at the panel it was asked for). */}
    <PresentedStack
      key={settingsVisit}
      open={inSettings}
      onBack={leaveSettings}
      title={SHELL_COPY.settings}
      initial={settingsRequest ? settingsScreen(settingsRequest) : undefined}
    >
      <SettingsHome />
    </PresentedStack>
    {/* Search over the whole shell (outside the sliding view, which would carry a fixed layer with it): the sidebar's
        magnifier grows into it; a result opens with the sidebar closed under it. */}
    <SearchScreen onOpened={() => setLeftPanel(false)} />
    </>
  );
};
