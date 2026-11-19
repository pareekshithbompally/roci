/** The meeting's one Actions menu: re-transcribe, copy, download, and show the recording in Finder. */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Icon, showToast } from '@shared/ui';
import { Menu, type MenuEntry } from '@shared/components';
import { saveTextFile } from '@services/tauri';
import { platform } from '@platform/index';
import { MEETING_PHASE_ACTION_SYMBOL } from '@config/meetingPhase.config';
import { SHOW_IN_FINDER, showInFinder, toastSavedFile } from '@shared/utils/savedFileToast';
import type { ProcessedResult } from '@shared/types';
import { buildExport, EXPORT_KIND, type ExportFormat, type ExportPart, type ExportScope } from '@features/home/utils/meetingExport';

interface MeetingActionsMenuProps {
  result: ProcessedResult;
  /** The tab on screen: "current view" downloads export it. */
  part: ExportPart;
  /** The recording on disk; Show in Finder is offered only when there is one. */
  recordingPath: string | null;
  /** Transcribe the recording again; offered only when it can be. */
  onRetranscribe?: () => void;
}

const DOWNLOADS: ReadonlyArray<{ label: string; format: ExportFormat; scope: ExportScope }> = [
  { label: 'Current View as Text', format: 'txt', scope: 'current' },
  { label: 'Current View as Markdown', format: 'md', scope: 'current' },
  { label: 'Current View as HTML', format: 'html', scope: 'current' },
  { label: 'Full Session as Markdown', format: 'md', scope: 'all' },
  { label: 'Full Session as JSON', format: 'json', scope: 'all' },
];

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${what} copied`, 'success');
  } catch (error: unknown) {
    console.error('[MeetingActionsMenu] Copy failed:', error);
    showToast(`Couldn't copy the ${what.toLowerCase()}`, 'error');
  }
}

async function download(result: ProcessedResult, format: ExportFormat, scope: ExportScope, part: ExportPart): Promise<void> {
  const { filename, content } = buildExport(result, format, scope, part);
  try {
    const path = await saveTextFile({ filename, content, kind: EXPORT_KIND[format], extension: format });
    if (path) toastSavedFile(path);
  } catch (error: unknown) {
    console.error('[MeetingActionsMenu] Save failed:', error);
    showToast('Failed to save file', 'error');
  }
}

/** Re-transcribe (when it can), Copy, Download, and Show in Finder (when there is a recording and a file manager). */
function menuItems({ result, part, recordingPath, onRetranscribe }: MeetingActionsMenuProps): MenuEntry[] {
  return [
    ...(onRetranscribe ? [{ type: 'item' as const, label: 'Re-transcribe', symbol: MEETING_PHASE_ACTION_SYMBOL['Re-transcribe'], onSelect: onRetranscribe }, { type: 'separator' as const }] : []),
    { type: 'label', label: 'Copy' },
    { type: 'item', label: 'Summary', onSelect: () => void copy(result.summary, 'Summary') },
    { type: 'item', label: 'Transcript', onSelect: () => void copy(result.transcript, 'Transcript') },
    { type: 'separator' },
    { type: 'label', label: 'Download' },
    ...DOWNLOADS.map(({ label, format, scope }) => ({ type: 'item' as const, label, onSelect: () => void download(result, format, scope, part) })),
    ...(platform.hasFileManager && recordingPath
      ? [{ type: 'separator' as const }, { type: 'item' as const, label: SHOW_IN_FINDER, onSelect: () => showInFinder(recordingPath) }]
      : []),
  ];
}

export const MeetingActionsMenu: React.FC<MeetingActionsMenuProps> = (props) => (
  <Menu
    label="Meeting actions"
    trigger={(
      <Button variant="secondary" size="sm">
        Actions
        <Icon icon={ChevronDown} size="xs" />
      </Button>
    )}
    items={menuItems(props)}
  />
);
