/** Opens when a recording start is refused for a missing permission; rows re-check after a request and on returning to Roci. */

import React from 'react';
import { CardRow, Section, Text } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
import { PERMISSION_CHECKLIST_COPY } from '@config/meetingLive.config';
import { FormDialog, PermissionAction } from '@shared/components';
import { useAppStore, usePermissionChecklistOpen } from '@shared/stores/appStore';
import { permissionsService, type PermissionKind, type PermissionRow } from '@services/permissions.service';
import { usePermissions } from '@features/recording/hooks/usePermissions';
import { platform } from '@platform/index';

const COPY = PERMISSION_CHECKLIST_COPY;

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
    <FormDialog open={open} onOpenChange={setOpen} title={COPY.title} size="sm" viewOnly submit={{ label: KIT_COPY.done, onPress: () => setOpen(false) }}>
      <Section footer={COPY.needs(platform.systemName)}>
        {rows.map((row) => (
          <CardRow
            key={row.kind}
            title={COPY.kinds[row.kind].title}
            description={COPY.kinds[row.kind].detail}
            actions={<RowAction row={row} request={request} />}
          />
        ))}
      </Section>
      {allReady && <Text as="p" variant="helper" tone="success">{COPY.ready}</Text>}
    </FormDialog>
  );
};
