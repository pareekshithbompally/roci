/** iPhone shell: a plain chatbot — top bar (sidebar · model · Record; Back in Settings), the content, the sidebar sliding over from the left. */

import React from 'react';
import { ChevronLeft, PanelLeft } from 'lucide-react';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useAppActions, useCurrentView } from '@shared/stores/appStore';
import { ModelPicker } from '@features/chat';
import { useRecordingBusy, useRecordingMeetingId, useStartRecording } from '@features/recording';
import { platform } from '@platform/index';
import { Button, Dot, Drawer, Icon, IconButton, Surface, TopBar } from '@shared/ui';
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

  return (
    <Surface as="main" variant="page" className="relative flex h-screen flex-col overflow-hidden">
      {inSettings ? (
        <TopBar
          leading={
            <Button variant="link" size="inline" onClick={leaveSettings}>
              <Icon icon={ChevronLeft} size="sm" />
              Back
            </Button>
          }
          title="Settings"
        />
      ) : (
        <TopBar
          leading={<IconButton icon={PanelLeft} label="Open sidebar" onClick={() => setLeftPanel(true)} />}
          title={<ModelPicker compact />}
          trailing={platform.canRecord && <RecordButton />}
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      <Drawer side="start" open={open} onClose={() => setLeftPanel(false)} label="Sidebar">
        <Sidebar shouldOffsetMacControls={false} onSearchClick={onSearchClick} />
      </Drawer>
    </Surface>
  );
};
