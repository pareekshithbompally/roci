/** Phone (iOS): the composer's + sheet — a row of tiles to record, attach or import a meeting, then the chat's thinking and
 *  tools; nothing that can't work is shown. */

import React from 'react';
import { Mic } from 'lucide-react';
import { useRecordingMeetingId, useStartRecording } from '@features/recording';
import { platform } from '@platform/index';
import { useImportMeetingActions } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { InfoSheet, TileStrip, type StripTile } from '@shared/ui';
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

  // What starts something, as one row of tiles: record, each kind of attachment, each import.
  const tiles: StripTile[] = [
    ...(platform.canRecord && !recordingNow
      ? [{ id: 'record', label: COPY.record, icon: Mic, onPress: closeThen(() => startRecording().catch((error: unknown) => console.error('[ComposerAddSheet] Record failed:', error))) }]
      : []),
    ...(onPickFiles ? attachOptions.map(({ label, icon, accept }) => ({ id: `attach-${label}`, label, icon, onPress: closeThen(() => onPickFiles(accept)) })) : []),
    ...importActions.map(({ id, label, icon, run }) => ({ id: `import-${id}`, label, icon, onPress: closeThen(run) })),
  ];

  return (
    <InfoSheet open={open} onOpenChange={onOpenChange} title={COPY.title}>
      <TileStrip label={COPY.title} tiles={tiles} />
      <ChatToolRows catalog={toolCatalog} onChooseImageModel={closeThen(() => openSettings('defaultModels'))} contextUsage={contextUsage} />
    </InfoSheet>
  );
};
