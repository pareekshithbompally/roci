/** The meeting's one actions menu (⋯): re-transcribe, copy, download, and show the recording in Finder. */

import React from 'react';
import { Ellipsis } from 'lucide-react';
import { IconButton, showToast } from '@shared/ui';
import { Menu, type MenuEntry } from '@shared/components';
import { saveTextFile } from '@services/tauri';
import { platform } from '@platform/index';
import { MEETING_PHASE_ACTION_SYMBOL } from '@config/meetingPhase.config';
import { SHOW_IN_FINDER, showInFinder, toastSavedFile } from '@shared/utils/savedFileToast';
import type { ProcessedResult } from '@shared/types';
import { buildExport, EXPORT_KIND, type ExportFormat, type ExportPart, type ExportScope } from '@features/home/utils/meetingExport';
import { MEETING_HEADER_COPY } from '@config/meetingLive.config';

interface MeetingActionsMenuProps {
  result: ProcessedResult;
  /** The tab on screen: "current view" downloads export it. */
  part: ExportPart;
  /** The recording on disk; Show in Finder is offered only when there is one. */
  recordingPath: string | null;
  /** Transcribe the recording again; offered only when it can be. */
  onRetranscribe?: () => void;
  onRename: () => void;
  onDetails: () => void;
}

const COPY = MEETING_HEADER_COPY;

const DOWNLOADS: ReadonlyArray<{ label: string; format: ExportFormat; scope: ExportScope }> = [
  { label: COPY.downloads.currentTxt, format: 'txt', scope: 'current' },
  { label: COPY.downloads.currentMd, format: 'md', scope: 'current' },
  { label: COPY.downloads.currentHtml, format: 'html', scope: 'current' },
  { label: COPY.downloads.allMd, format: 'md', scope: 'all' },
  { label: COPY.downloads.allJson, format: 'json', scope: 'all' },
];

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(COPY.copied(what), 'success');
  } catch (error: unknown) {
    console.error('[MeetingActionsMenu] Copy failed:', error);
    showToast(COPY.copyFailed(what), 'error');
  }
}

async function download(result: ProcessedResult, format: ExportFormat, scope: ExportScope, part: ExportPart): Promise<void> {
  const { filename, content } = buildExport(result, format, scope, part);
  try {
    const path = await saveTextFile({ filename, content, kind: EXPORT_KIND[format], extension: format });
    if (path) toastSavedFile(path);
  } catch (error: unknown) {
    console.error('[MeetingActionsMenu] Save failed:', error);
    showToast(COPY.saveFailed, 'error');
  }
}

/** Re-transcribe (when it can), Copy, Download, and Show in Finder (when there is a recording and a file manager). */
function menuItems({ result, part, recordingPath, onRetranscribe, onRename, onDetails }: MeetingActionsMenuProps): MenuEntry[] {
  return [
    { type: 'item', label: MEETING_HEADER_COPY.rename, onSelect: onRename },
    { type: 'item', label: MEETING_HEADER_COPY.details, onSelect: onDetails },
    { type: 'separator' },
    ...(onRetranscribe ? [{ type: 'item' as const, label: COPY.retranscribe, symbol: MEETING_PHASE_ACTION_SYMBOL['Re-transcribe'], onSelect: onRetranscribe }, { type: 'separator' as const }] : []),
    { type: 'label', label: COPY.copy },
    { type: 'item', label: COPY.summary, onSelect: () => void copy(result.summary, COPY.summary) },
    { type: 'item', label: COPY.transcript, onSelect: () => void copy(result.transcript, COPY.transcript) },
    { type: 'separator' },
    { type: 'label', label: COPY.download },
    ...DOWNLOADS.map(({ label, format, scope }) => ({ type: 'item' as const, label, onSelect: () => void download(result, format, scope, part) })),
    ...(platform.hasFileManager && recordingPath
      ? [{ type: 'separator' as const }, { type: 'item' as const, label: SHOW_IN_FINDER, onSelect: () => showInFinder(recordingPath) }]
      : []),
  ];
}

export const MeetingActionsMenu: React.FC<MeetingActionsMenuProps> = (props) => (
  <Menu
    label={MEETING_HEADER_COPY.actions}
    trigger={<IconButton icon={Ellipsis} variant="secondary" size="sm" label={MEETING_HEADER_COPY.actions} />}
    items={menuItems(props)}
  />
);
