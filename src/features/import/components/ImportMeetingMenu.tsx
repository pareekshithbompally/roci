/** Import an existing meeting: the actions once, shown in the composer's + menu (Mac) or + sheet (phone). */

import { AudioWaveform, FileInput, Subtitles, type LucideIcon } from 'lucide-react';
import { useImport } from '@features/import/context/ImportContext';

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
