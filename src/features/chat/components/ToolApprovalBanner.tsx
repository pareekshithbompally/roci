/** "May this MCP tool run?" above the chat input; answers resolve the oldest pending tool call. */

import React from 'react';
import { ShieldQuestion } from 'lucide-react';
import { Button, Icon, Surface, Text } from '@shared/ui';
import { usePendingApprovals, useResolveApproval } from '@shared/stores/toolApprovalStore';

const ToolApprovalBanner: React.FC = () => {
  const pending = usePendingApprovals();
  const resolveApproval = useResolveApproval();

  const request = pending[0];
  if (!request) return null;
  const queued = pending.length - 1;

  return (
    <Surface
        variant="field"
        radius="xl"
        className="px-4 py-3 space-y-2"
        role="alertdialog"
        aria-label="Tool permission"
      >
        <div className="flex items-start gap-2">
          <Icon icon={ShieldQuestion} size="sm" tone="muted" className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <Text as="p">
              Allow <Text variant="bodyStrong">{request.serverName}</Text> to run{' '}
              <Text variant="mono">{request.toolName}</Text>?
            </Text>
            {queued > 0 && (
              <Text as="p" variant="helper" tone="faint">{queued} more waiting</Text>
            )}
          </div>
        </div>

        {request.argsPreview !== '{}' && (
          <Surface variant="subtle" radius="md" className="px-3 py-2 max-h-32 overflow-y-auto">
            <Text as="div" variant="mono" tone="muted" className="whitespace-pre-wrap break-all">
              {request.argsPreview}
            </Text>
          </Surface>
        )}

        {/* Wraps on a phone when the server's name makes "Always allow" long. */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="secondary" onClick={() => resolveApproval(request.toolCallId, 'deny')}>
            Deny
          </Button>
          <Button variant="outline" onClick={() => resolveApproval(request.toolCallId, 'allow-once')}>
            Allow once
          </Button>
          <Button variant="primary" onClick={() => resolveApproval(request.toolCallId, 'allow-always')}>
            Always allow {request.serverName}
          </Button>
        </div>
    </Surface>
  );
};

export default ToolApprovalBanner;
