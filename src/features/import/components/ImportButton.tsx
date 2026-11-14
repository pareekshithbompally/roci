/**
 * ImportButton — Split dropdown for importing existing meetings.
 *
 * Uses existing DropdownMenu primitives. Matches IdleView action chip styling.
 */

import React from 'react';
import { Plus, AudioWaveform, Subtitles, ChevronDown } from 'lucide-react';
import { useImport } from '@features/import/context/ImportContext';
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Icon } from '@shared/ui';

export const ImportButton: React.FC = () => {
  const { importAudio, importTranscripts } = useImport();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon icon={Plus} size="xs" />
          Import Meeting
          <Icon icon={ChevronDown} size="xs" tone="faint" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => importAudio()}>
          <Icon icon={AudioWaveform} size="sm" />
          From Audio Recording
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => importTranscripts()}>
          <Icon icon={Subtitles} size="sm" />
          From Transcript
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
