/**
 * ImportButton — Split dropdown for importing existing meetings.
 *
 * Uses existing DropdownMenu primitives. Matches IdleView action chip styling.
 */

import React from 'react';
import { Plus, AudioWaveform, Subtitles, ChevronDown } from 'lucide-react';
import { useImport } from '@features/import/context/ImportContext';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@shared/ui/dropdown-menu';

export const ImportButton: React.FC = () => {
  const { importAudio, importTranscripts } = useImport();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} hover:${TEXT.heading} transition-all`}
        >
          <Plus className="w-4 h-4" />
          <span>Import Meeting</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => importAudio()}>
          <AudioWaveform className="w-4 h-4" />
          From Audio Recording
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => importTranscripts()}>
          <Subtitles className="w-4 h-4" />
          From Transcript
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
