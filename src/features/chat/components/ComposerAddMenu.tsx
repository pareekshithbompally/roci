/** Mac: the composer's + menu (the system menu) — attach, import a meeting, take a screenshot; the phone's is ComposerAddSheet. */

import React from 'react';
import { Plus } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { Menu, type MenuEntry } from '@shared/components';
import { IMPORT_MEETING_LABEL, useImportMeetingActions } from '@features/import';
import { canTakeScreenshots, listCapturableWindows, takeScreenshot } from '@services/tauri';
import { ATTACH_OPTIONS } from './ComposerAddSheet';

interface ComposerAddMenuProps {
  /** Opens the file picker with this filter. */
  onPickFiles: (accept: string) => void;
  disabled?: boolean;
  /** Receives a screenshot to attach; absent when the chat can't take one. */
  onScreenshot?: (base64: string, name: string) => void;
}

/** Full screen, then each window open now (listed as the menu opens). */
async function screenshotEntries(onScreenshot: (base64: string, name: string) => void): Promise<MenuEntry[]> {
  const shoot = (windowId: number | null, name: string) => () => {
    takeScreenshot(windowId)
      .then((base64) => onScreenshot(base64, name))
      .catch((err: unknown) => console.error('[ComposerAddMenu] Screenshot failed:', err));
  };
  const windows = await listCapturableWindows().catch((err: unknown) => {
    console.error('[ComposerAddMenu] Failed to list windows:', err);
    return [];
  });
  return [
    { type: 'item', label: 'Full Screen', onSelect: shoot(null, 'Full Screen') },
    ...(windows.length ? [{ type: 'separator' as const }] : []),
    ...windows.map((win) => ({ type: 'item' as const, label: win.app_name, onSelect: shoot(win.window_id, win.app_name) })),
  ];
}

export const ComposerAddMenu: React.FC<ComposerAddMenuProps> = ({ onPickFiles, disabled, onScreenshot }) => {
  const importActions = useImportMeetingActions();
  const canScreenshot = !!onScreenshot && canTakeScreenshots();

  const items = async (): Promise<MenuEntry[]> => [
    ...ATTACH_OPTIONS.map(({ label, accept }) => ({ type: 'item' as const, label, disabled, onSelect: () => onPickFiles(accept) })),
    { type: 'separator' },
    { type: 'submenu', label: IMPORT_MEETING_LABEL, items: importActions.map(({ label, run }) => ({ type: 'item' as const, label, onSelect: run })) },
    ...(canScreenshot && onScreenshot
      ? [{ type: 'separator' as const }, { type: 'submenu' as const, label: 'Take Screenshot', items: await screenshotEntries(onScreenshot) }]
      : []),
  ];

  return <Menu label="Add" align="start" trigger={<IconButton icon={Plus} label="Add" size="toolbar" />} items={items} />;
};
