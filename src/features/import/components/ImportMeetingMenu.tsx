/** Import an existing meeting: the actions once, shown as the composer's "Import Meeting" submenu (Mac) or rows (phone). */

import React from 'react';
import { AudioWaveform, FileInput, Subtitles, type LucideIcon } from 'lucide-react';
import { useImport } from '@features/import/context/ImportContext';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, Icon } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

export interface ImportMeetingAction {
  id: 'audio' | 'transcript';
  label: string;
  icon: LucideIcon;
  run: () => void;
}

export const IMPORT_MEETING_LABEL = 'Import Meeting';
export const IMPORT_MEETING_ICON = FileInput;

/** The import actions every surface renders. */
export function useImportMeetingActions(): ImportMeetingAction[] {
  const { importAudio, importTranscripts } = useImport();
  return [
    { id: 'audio', label: 'From Audio Recording', icon: AudioWaveform, run: () => void importAudio() },
    { id: 'transcript', label: 'From Transcript', icon: Subtitles, run: () => void importTranscripts() },
  ];
}

export const ImportMeetingMenu: React.FC = () => {
  const actions = useImportMeetingActions();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon icon={IMPORT_MEETING_ICON} size="sm" />
        <span>{IMPORT_MEETING_LABEL}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={UI_CONFIG.picker.flyoutOffset}>
        {actions.map(({ id, label, icon, run }) => (
          <DropdownMenuItem key={id} onSelect={run}>
            <Icon icon={icon} size="sm" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
