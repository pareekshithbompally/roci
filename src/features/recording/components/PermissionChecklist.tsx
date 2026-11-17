/** Opens when a recording start is refused for a missing permission; rows re-check after a request and on returning to Roci. */

import React from 'react';
import { X } from 'lucide-react';
import { Card, CardRow, Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, IconButton, Text } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { useAppStore, usePermissionChecklistOpen } from '@shared/stores/appStore';
import { permissionsService, type PermissionKind, type PermissionRow } from '@services/permissions.service';
import { usePermissions } from '@features/recording/hooks/usePermissions';
import { platform } from '@platform/index';

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

interface RowActionProps {
  row: PermissionRow;
  request: (kind: PermissionKind) => Promise<void>;
}

const RowAction: React.FC<RowActionProps> = ({ row, request }) => (
  <PermissionAction
    state={row.state}
    onRequest={() => request(row.kind).catch(reportFailure('request'))}
    onOpenSettings={() => permissionsService.openSettings(row.kind).catch(reportFailure('open settings'))}
  />
);

export const PermissionChecklist: React.FC = () => {
  const open = usePermissionChecklistOpen();
  const setOpen = useAppStore((s) => s.setPermissionChecklistOpen);
  const { data: rows = [], request } = usePermissions(open);
  const allReady = rows.length > 0 && rows.every((row) => row.state === 'ready');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Allow recording</DialogTitle>
            <DialogClose asChild>
              <IconButton icon={X} label="Close" size="sm" className="-mr-1" />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            {platform.systemName} needs these before Roci can record.
          </DialogDescription>

          <Card className="mt-4">
            {rows.map((row) => (
              <CardRow
                key={row.kind}
                title={COPY[row.kind].title}
                description={COPY[row.kind].detail}
                actions={<RowAction row={row} request={request} />}
              />
            ))}
          </Card>

          {allReady && (
            <Text as="p" variant="helper" tone="success" className="mt-4">
              All set. Start the recording again.
            </Text>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
