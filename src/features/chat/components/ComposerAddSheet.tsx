/** Phone (iOS): the composer's + sheet — attach, import a meeting, the chat's thinking and tools; nothing that can't work is shown. */

import React from 'react';
import { FileText, Image as ImageIcon, Music } from 'lucide-react';
import { IMPORT_MEETING_LABEL, useImportMeetingActions } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { BottomSheet, CardRow, Icon, Section } from '@shared/ui';
import { ChatToolRows } from './tools/ChatToolRows';

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
}

export const ComposerAddSheet: React.FC<ComposerAddSheetProps> = ({ open, onOpenChange, onPickFiles }) => {
  const importActions = useImportMeetingActions();
  const { openSettings } = useAppActions();
  const closeThen = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add">
      <div className="flex flex-col gap-section overflow-y-auto p-4">
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
        <ChatToolRows onChooseImageModel={closeThen(() => openSettings('capabilities'))} />
      </div>
    </BottomSheet>
  );
};
