/** iPhone shell: a plain chatbot — top bar (sidebar · model · New chat), the content; opening the sidebar slides the view aside to reveal it, Settings rises as a sheet. */

import React from 'react';
import { PanelLeft, SquarePen, X } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useAppActions, useAppStore, useCurrentView } from '@shared/stores/appStore';
import { ModelPicker, startNewChat } from '@features/chat';
import { SettingsHome, settingsScreen } from '@features/settings';
import { BottomSheet, IconButton, NavStack, RevealLayout, Surface, TopBar } from '@shared/ui';
import { ActivityCapsule } from '@shared/components';
import { Sidebar } from './Sidebar';

interface PhoneShellProps {
  children: React.ReactNode;
}

export const PhoneShell: React.FC<PhoneShellProps> = ({ children }) => {
  const open = useLeftPanel((s) => s.open);
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const inSettings = useCurrentView() === 'settings';
  const { leaveSettings } = useAppActions();
  const settingsRequest = useAppStore((s) => s.settingsRequest);

  return (
    <RevealLayout open={open} onClose={() => setLeftPanel(false)} paneLabel="Sidebar" pane={<Sidebar variant="sheet" shouldOffsetMacControls={false} />}>
      <Surface as="main" variant="page" className="relative flex h-full flex-col overflow-hidden">
        <TopBar
          leading={<IconButton icon={PanelLeft} size="fab" variant="bar" label="Open sidebar" onClick={() => setLeftPanel(true)} />}
          title={<ModelPicker compact />}
          trailing={<IconButton icon={SquarePen} size="fab" variant="bar" label="New chat" onClick={startNewChat} />}
        />
        {/* Clear of the home indicator once, for every screen (idle, chat, meeting). */}
        <div className="relative flex min-h-0 flex-1 flex-col pb-safe-bottom">
          {/* Work in progress shows here, under the bar, whatever the screen; the sidebar no longer carries it. */}
          <ActivityCapsule />
          {children}
        </div>
      </Surface>
      <BottomSheet open={inSettings} onOpenChange={(open) => !open && leaveSettings()} title="Settings" size="full">
        <NavStack
          title="Settings"
          action={<IconButton icon={X} label="Close" size="fab" variant="bar" onClick={leaveSettings} />}
          initial={settingsRequest ? settingsScreen(settingsRequest) : undefined}
        >
          <SettingsHome />
        </NavStack>
      </BottomSheet>
    </RevealLayout>
  );
};
