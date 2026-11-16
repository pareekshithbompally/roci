/** "Import meeting" submenu for a dropdown (the composer's + menu): from an audio recording or a transcript. */

import React from 'react';
import { AudioWaveform, FileInput, Subtitles } from 'lucide-react';
import { useImport } from '@features/import/context/ImportContext';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, Icon } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

export const ImportMeetingMenu: React.FC = () => {
  const { importAudio, importTranscripts } = useImport();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon icon={FileInput} size="sm" />
        <span>Import Meeting</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={UI_CONFIG.picker.flyoutOffset}>
        <DropdownMenuItem onSelect={() => importAudio()}>
          <Icon icon={AudioWaveform} size="sm" />
          <span>From Audio Recording</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => importTranscripts()}>
          <Icon icon={Subtitles} size="sm" />
          <span>From Transcript</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
