/** Phone (iOS): the composer's + sheet — attach, import a meeting, the chat's thinking and tools; nothing that can't work is shown. */

import React from 'react';
import { FileText, Image as ImageIcon, Mic, Music } from 'lucide-react';
import { useRecordingMeetingId, useStartRecording } from '@features/recording';
import { platform } from '@platform/index';
import { IMPORT_MEETING_LABEL, useImportMeetingActions } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { BottomSheet, CardRow, Icon, Section, SheetBody } from '@shared/ui';
import { ChatToolRows } from './tools/ChatToolRows';
import type { ContextUsage } from '@shared/hooks/useContextUsage';

/** What + attaches (`accept` filters the file picker): the Mac menu's items and this sheet's rows. */
export const ATTACH_OPTIONS = [
  { label: 'Images', icon: ImageIcon, accept: 'image/*' },
  { label: 'Files', icon: FileText, accept: '.pdf,.txt,.md,.csv,.json,.doc,.docx' },
  { label: 'Audio', icon: Music, accept: 'audio/*' },
] as const;

interface ComposerAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the file picker with this filter; absent when the chat can't take attachments right now. */
  onPickFiles?: (accept: string) => void;
  /** The chat's context window (the Mac shows it in the composer toolbar); null until known. */
  contextUsage?: ContextUsage | null;
}

export const ComposerAddSheet: React.FC<ComposerAddSheetProps> = ({ open, onOpenChange, onPickFiles, contextUsage }) => {
  const importActions = useImportMeetingActions();
  const startRecording = useStartRecording();
  const recordingNow = useRecordingMeetingId() !== null;
  const { openSettings } = useAppActions();
  const closeThen = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add">
      <SheetBody>
        {platform.canRecord && !recordingNow && (
          <Section title="Meeting">
            <CardRow
              title="Record"
              leading={<Icon icon={Mic} size="sm" />}
              onPress={closeThen(() => startRecording().catch((error: unknown) => console.error('[ComposerAddSheet] Record failed:', error)))}
            />
          </Section>
        )}
        {onPickFiles && (
          <Section title="Attach">
            {ATTACH_OPTIONS.map(({ label, icon, accept }) => (
              <CardRow key={label} title={label} leading={<Icon icon={icon} size="sm" />} onPress={closeThen(() => onPickFiles(accept))} />
            ))}
          </Section>
        )}
        <Section title={IMPORT_MEETING_LABEL}>
          {importActions.map(({ id, label, icon, run }) => (
            <CardRow key={id} title={label} leading={<Icon icon={icon} size="sm" />} onPress={closeThen(run)} />
          ))}
        </Section>
        <ChatToolRows onChooseImageModel={closeThen(() => openSettings('defaultModels'))} contextUsage={contextUsage} />
      </SheetBody>
    </BottomSheet>
  );
};
