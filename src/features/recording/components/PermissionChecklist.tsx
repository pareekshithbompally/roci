/**
 * PermissionChecklist
 *
 * Opens when a recording start is refused for a missing macOS permission
 * (HEX: refused with code `permission`, no error tone, the permission helper
 * opens). Rows come from the backend in checklist order and flip to Allowed
 * as soon as the grant lands, by polling while open.
 */

import React from 'react';
import { Check, X } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@shared/ui';
import { useAppStore, usePermissionChecklistOpen } from '@shared/stores/appStore';
import { permissionsService, type PermissionKind, type PermissionRow } from '@services/permissions.service';
import { BORDER, TEXT, RADIUS, SURFACE } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { usePermissions } from '@features/recording/hooks/usePermissions';

const COPY: Record<PermissionKind, { title: string; detail: string }> = {
  microphone: {
    title: 'Microphone',
    detail: 'Records your voice.',
  },
  'system-audio': {
    title: 'System Audio Recording',
    detail: 'Records the other participants. Screen Recording also works.',
  },
};

function reportFailure(action: string) {
  return (error: unknown) => console.error(`[PermissionChecklist] ${action} failed:`, error);
}

const RowAction: React.FC<{ row: PermissionRow }> = ({ row }) => {
  if (row.state === 'ready') {
    return (
      <span className={`inline-flex items-center gap-1 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.success}`}>
        <Check className="w-4 h-4" /> Allowed
      </span>
    );
  }
  if (row.state === 'needs-request') {
    return (
      <Button variant="primary" size="sm" onClick={() => permissionsService.request(row.kind).catch(reportFailure('request'))}
      >
        Allow
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={() => permissionsService.openSettings(row.kind).catch(reportFailure('open settings'))}
    >
      Open Settings
    </Button>
  );
};

export const PermissionChecklist: React.FC = () => {
  const open = usePermissionChecklistOpen();
  const setOpen = useAppStore((s) => s.setPermissionChecklistOpen);
  const { data: rows = [] } = usePermissions(open);
  const allReady = rows.length > 0 && rows.every((row) => row.state === 'ready');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Allow recording</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="iconSm" className="-mr-1" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogDescription className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
            macOS needs these before Kasset can record.
          </DialogDescription>

          <ul className={`mt-4 ${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg} divide-y ${BORDER.default}`}>
            {rows.map((row) => (
              <li key={row.kind} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>{COPY[row.kind].title}</p>
                  <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>{COPY[row.kind].detail}</p>
                </div>
                <RowAction row={row} />
              </li>
            ))}
          </ul>

          {allReady && (
            <p className={`mt-4 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.success}`}>
              All set. Start the recording again.
            </p>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
