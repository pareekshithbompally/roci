/** Phone (iOS): the composer's + sheet — attach, import a meeting, the chat's thinking and tools; nothing that can't work is shown. */

import React from 'react';
import { Mic } from 'lucide-react';
import { useRecordingMeetingId, useStartRecording } from '@features/recording';
import { platform } from '@platform/index';
import { IMPORT_MEETING_LABEL, useImportMeetingActions } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { CardRow, Icon, InfoSheet, Section } from '@shared/ui';
import { ChatToolRows } from './tools/ChatToolRows';
import type { ContextUsage } from '@shared/hooks/useContextUsage';
import type { AttachOption } from '@features/chat/hooks/useAttachOptions';
import type { ToolCatalog } from '@features/chat/hooks';
import { COMPOSER_ADD_COPY as COPY } from '@config/chat.config';


interface ComposerAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the chat's model can be sent. */
  attachOptions: AttachOption[];
  /** Opens the file picker with this filter; absent when the chat can't take attachments right now. */
  onPickFiles?: (accept: string) => void;
  /** The chat's context window (the Mac shows it in the composer toolbar); null until known. */
  contextUsage?: ContextUsage | null;
  /** The composer's one tool catalog. */
  toolCatalog: ToolCatalog;
}

export const ComposerAddSheet: React.FC<ComposerAddSheetProps> = ({ open, onOpenChange, attachOptions, onPickFiles, contextUsage, toolCatalog }) => {
  const importActions = useImportMeetingActions();
  const startRecording = useStartRecording();
  const recordingNow = useRecordingMeetingId() !== null;
  const { openSettings } = useAppActions();
  const closeThen = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <InfoSheet open={open} onOpenChange={onOpenChange} title={COPY.title}>
        {platform.canRecord && !recordingNow && (
          <Section title={COPY.meeting}>
            <CardRow
              title={COPY.record}
              leading={<Icon icon={Mic} size="sm" />}
              onPress={closeThen(() => startRecording().catch((error: unknown) => console.error('[ComposerAddSheet] Record failed:', error)))}
            />
          </Section>
        )}
        {onPickFiles && (
          <Section title={COPY.attach}>
            {attachOptions.map(({ label, icon, accept }) => (
              <CardRow key={label} title={label} leading={<Icon icon={icon} size="sm" />} onPress={closeThen(() => onPickFiles(accept))} />
            ))}
          </Section>
        )}
        <Section title={IMPORT_MEETING_LABEL}>
          {importActions.map(({ id, label, icon, run }) => (
            <CardRow key={id} title={label} leading={<Icon icon={icon} size="sm" />} onPress={closeThen(run)} />
          ))}
        </Section>
        <ChatToolRows catalog={toolCatalog} onChooseImageModel={closeThen(() => openSettings('defaultModels'))} contextUsage={contextUsage} />
    </InfoSheet>
  );
};
