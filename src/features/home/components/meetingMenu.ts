/** A meeting's rare actions, behind ⋯ in its item actions: Rename, Details (which models wrote it live there), Re-transcribe,
 *  then Copy ▸ and Download ▸ as submenus, and Show in Finder. */

import { showToast } from '@shared/ui';
import type { MenuEntry } from '@shared/components';
import { MENU_SYMBOLS } from '@config/ui.config';
import { saveTextFile } from '@services/tauri';
import { platform } from '@platform/index';
import { MEETING_PHASE_ACTION_SYMBOL } from '@config/meetingPhase.config';
import { SHOW_IN_FINDER, showInFinder, toastSavedFile } from '@shared/utils/savedFileToast';
import type { ProcessedResult } from '@shared/types';
import { buildExport, EXPORT_KIND, type ExportFormat, type ExportPart, type ExportScope } from '@features/home/utils/meetingExport';
import { MEETING_HEADER_COPY } from '@config/meetingLive.config';

export interface MeetingMenuProps {
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
    console.error('[meetingMenu] Copy failed:', error);
    showToast(COPY.copyFailed(what), 'error');
  }
}

async function download(result: ProcessedResult, format: ExportFormat, scope: ExportScope, part: ExportPart): Promise<void> {
  const { filename, content } = buildExport(result, format, scope, part);
  try {
    const path = await saveTextFile({ filename, content, kind: EXPORT_KIND[format], extension: format });
    if (path) toastSavedFile(path);
  } catch (error: unknown) {
    console.error('[meetingMenu] Save failed:', error);
    showToast(COPY.saveFailed, 'error');
  }
}

/** Rename, Details, Re-transcribe (when it can), Copy, Download, and Show in Finder (when there is a recording and a file manager). */
export function meetingMenuEntries({ result, part, recordingPath, onRetranscribe, onRename, onDetails }: MeetingMenuProps): MenuEntry[] {
  return [
    { type: 'item', label: MEETING_HEADER_COPY.rename, onSelect: onRename },
    { type: 'item', label: MEETING_HEADER_COPY.details, onSelect: onDetails },
    { type: 'separator' },
    ...(onRetranscribe ? [{ type: 'item' as const, label: COPY.retranscribe, symbol: MEETING_PHASE_ACTION_SYMBOL['Re-transcribe'], onSelect: onRetranscribe }, { type: 'separator' as const }] : []),
    {
      type: 'submenu',
      label: COPY.copy,
      symbol: MENU_SYMBOLS.copy,
      items: [
        { type: 'item', label: COPY.summary, onSelect: () => void copy(result.summary, COPY.summary) },
        { type: 'item', label: COPY.transcript, onSelect: () => void copy(result.transcript, COPY.transcript) },
      ],
    },
    {
      type: 'submenu',
      label: COPY.download,
      items: DOWNLOADS.map(({ label, format, scope }) => ({ type: 'item' as const, label, onSelect: () => void download(result, format, scope, part) })),
    },
    ...(platform.hasFileManager && recordingPath
      ? [{ type: 'separator' as const }, { type: 'item' as const, label: SHOW_IN_FINDER, onSelect: () => showInFinder(recordingPath) }]
      : []),
  ];
}
