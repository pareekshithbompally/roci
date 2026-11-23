/** iPhone shell: a plain chatbot — top bar (sidebar · model · New chat), the content; opening the sidebar slides the view aside
 *  to reveal it, Settings rises as a sheet. A place opened from the sidebar (To-dos, Gallery…) is a pushed page instead: its
 *  own bar with ‹ back to the sidebar, sliding in over home. The model picker is a chat's, so only the chat screens show it. */

import React, { useCallback } from 'react';
import { PanelLeft, SquarePen, X } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useAppActions, useAppStatus, useAppStore, useCurrentView } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ModelPicker, startNewChat } from '@features/chat';
import { SettingsHome, settingsScreen } from '@features/settings';
import { BottomSheet, IconButton, NavStack, RevealLayout, Surface, TopBar, ViewBackContext, cn } from '@shared/ui';
import { SearchScreen } from '@features/palette';
import { Sidebar } from './Sidebar';
import { SHELL_COPY } from '@config/shell.config';
import { KIT_COPY } from '@config/kitCopy.config';

interface PhoneShellProps {
  children: React.ReactNode;
}

export const PhoneShell: React.FC<PhoneShellProps> = ({ children }) => {
  const open = useLeftPanel((s) => s.open);
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const view = useCurrentView();
  const inSettings = view === 'settings';
  // A place from the sidebar, shown as a pushed page (Settings is a sheet over home).
  const place = view !== 'home' && !inSettings;
  const status = useAppStatus();
  const chatting = status === AppStatus.IDLE || status === AppStatus.CHAT;
  const { leaveSettings, setCurrentView } = useAppActions();
  const backToSidebar = useCallback(() => {
    setCurrentView('home');
    setLeftPanel(true);
  }, [setCurrentView, setLeftPanel]);
  const settingsRequest = useAppStore((s) => s.settingsRequest);

  return (
    <>
    <RevealLayout open={open} onOpen={() => setLeftPanel(true)} onClose={() => setLeftPanel(false)} paneLabel="Sidebar" pane={<Sidebar variant="sheet" shouldOffsetMacControls={false} />}>
      <Surface as="main" variant="page" className="relative flex h-full flex-col overflow-hidden">
        {!place && (
          <TopBar
            leading={<IconButton icon={PanelLeft} size="fab" variant="bar" label={SHELL_COPY.openSidebar} onClick={() => setLeftPanel(true)} />}
            title={chatting ? <ModelPicker compact bar /> : undefined}
            trailing={<IconButton icon={SquarePen} size="fab" variant="bar" label={SHELL_COPY.newChat} onClick={startNewChat} />}
          />
        )}
        {/* Clear of the home indicator once, for every screen; a place slides in as a pushed page with ‹ back to the sidebar. */}
        <ViewBackContext.Provider value={place ? backToSidebar : null}>
          <div key={place ? view : 'home'} className={cn('relative flex min-h-0 flex-1 flex-col pb-safe-bottom', place && 'animate-push-in')}>
            {children}
          </div>
        </ViewBackContext.Provider>
      </Surface>
      <BottomSheet open={inSettings} onOpenChange={(open) => !open && leaveSettings()} title={SHELL_COPY.settings} size="full">
        <NavStack
          title={SHELL_COPY.settings}
          action={<IconButton icon={X} label={KIT_COPY.close} size="fab" variant="bar" onClick={leaveSettings} />}
          initial={settingsRequest ? settingsScreen(settingsRequest) : undefined}
        >
          <SettingsHome />
        </NavStack>
      </BottomSheet>
    </RevealLayout>
    {/* Search over the whole shell (outside the sliding view, which would carry a fixed layer with it): the sidebar's
        magnifier grows into it; a result opens with the sidebar closed under it. */}
    <SearchScreen onOpened={() => setLeftPanel(false)} />
    </>
  );
};
