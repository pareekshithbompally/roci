/** The meeting's one Actions menu: re-transcribe, copy, download, and show the recording in Finder. */

import React from 'react';
import { ChevronDown, Copy, FileCode, FileJson, FileText, FileType, MessageSquare, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  showToast,
} from '@shared/ui';
import { AppIcon } from '@shared/components';
import { APP_CONFIG } from '@config/app.config';
import { revealInFinder, saveTextFile } from '@services/tauri';
import { platform } from '@platform/index';
import { toastSavedFile } from '@shared/utils/savedFileToast';
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

const DOWNLOADS: ReadonlyArray<{ label: string; icon: LucideIcon; format: ExportFormat; scope: ExportScope }> = [
  { label: 'Current view as Text', icon: FileText, format: 'txt', scope: 'current' },
  { label: 'Current view as Markdown', icon: FileCode, format: 'md', scope: 'current' },
  { label: 'Current view as HTML', icon: FileType, format: 'html', scope: 'current' },
  { label: 'Full session as Markdown', icon: FileCode, format: 'md', scope: 'all' },
  { label: 'Full session as JSON', icon: FileJson, format: 'json', scope: 'all' },
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

function reveal(path: string): void {
  revealInFinder(path).catch((error: unknown) => {
    console.error('[MeetingActionsMenu] Reveal failed:', error);
    showToast("Couldn't show the recording in Finder", 'error');
  });
}

export const MeetingActionsMenu: React.FC<MeetingActionsMenuProps> = ({ result, part, recordingPath, onRetranscribe }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" size="sm">
        Actions
        <Icon icon={ChevronDown} size="xs" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {onRetranscribe && (
        <>
          <DropdownMenuItem onSelect={onRetranscribe}>
            <Icon icon={RefreshCw} size="sm" /> Re-transcribe
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuLabel>Copy</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => void copy(result.summary, 'Summary')}>
        <Icon icon={Copy} size="sm" /> Summary
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void copy(result.transcript, 'Transcript')}>
        <Icon icon={MessageSquare} size="sm" /> Transcript
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Download</DropdownMenuLabel>
      {DOWNLOADS.map(({ label, icon, format, scope }) => (
        <DropdownMenuItem key={label} onSelect={() => void download(result, format, scope, part)}>
          <Icon icon={icon} size="sm" /> {label}
        </DropdownMenuItem>
      ))}
      {platform.hasFileManager && recordingPath && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => reveal(recordingPath)}>
            <AppIcon app={APP_CONFIG.macApps.finder} size="sm" /> Show Recording in Finder
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);
