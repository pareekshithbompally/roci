/** iPhone shell: a plain chatbot — top bar (sidebar · model · New chat / Record), the content; the sidebar slides over from the left, Settings rises as a sheet. */

import React from 'react';
import { PanelLeft, SquarePen, X } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useAppActions, useAppStore, useCurrentView } from '@shared/stores/appStore';
import { ModelPicker, startNewChat } from '@features/chat';
import { SettingsHome, settingsScreen } from '@features/settings';
import { useRecordingBusy, useRecordingMeetingId, useStartRecording } from '@features/recording';
import { platform } from '@platform/index';
import { BottomSheet, Button, Dot, Drawer, IconButton, NavStack, Surface, TopBar } from '@shared/ui';
import { Sidebar } from './Sidebar';

interface PhoneShellProps {
  children: React.ReactNode;
  onSearchClick?: () => void;
}

const RecordButton: React.FC = () => {
  const startRecording = useStartRecording();
  const busy = useRecordingBusy();
  const meetingId = useRecordingMeetingId();
  const record = () => {
    startRecording().catch((error: unknown) => console.error('[PhoneShell] Failed to start recording:', error));
  };
  return (
    <Button variant="outline" size="sm" onClick={record} disabled={busy || !!meetingId}>
      <Dot tone="danger" />
      Record
    </Button>
  );
};

export const PhoneShell: React.FC<PhoneShellProps> = ({ children, onSearchClick }) => {
  const open = useLeftPanel((s) => s.open);
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const inSettings = useCurrentView() === 'settings';
  const { leaveSettings } = useAppActions();
  const settingsRequest = useAppStore((s) => s.settingsRequest);

  return (
    <Surface as="main" variant="page" className="relative flex h-screen flex-col overflow-hidden">
      <TopBar
        leading={<IconButton icon={PanelLeft} label="Open sidebar" onClick={() => setLeftPanel(true)} />}
        title={<ModelPicker compact />}
        trailing={platform.canRecord ? <RecordButton /> : <IconButton icon={SquarePen} label="New chat" onClick={startNewChat} />}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      <Drawer side="start" open={open} onClose={() => setLeftPanel(false)} label="Sidebar">
        <Sidebar shouldOffsetMacControls={false} onSearchClick={onSearchClick} />
      </Drawer>
      <BottomSheet open={inSettings} onOpenChange={(open) => !open && leaveSettings()} title="Settings" size="full">
        <NavStack
          title="Settings"
          action={<IconButton icon={X} label="Close" size="fab" variant="outline" onClick={leaveSettings} />}
          initial={settingsRequest ? settingsScreen(settingsRequest) : undefined}
        >
          <SettingsHome />
        </NavStack>
      </BottomSheet>
    </Surface>
  );
};
