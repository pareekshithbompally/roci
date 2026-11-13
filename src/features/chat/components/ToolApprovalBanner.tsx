/**
 * ToolApprovalBanner
 *
 * "May this MCP tool run?" prompt above the chat input (Jan's tool approval
 * dialog). Shows the oldest pending request; answers resolve the awaiting
 * tool call. Same shell as TodoConfirmationBanner.
 */

import React from 'react';
import { ShieldQuestion } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { Button } from '@shared/ui';
import { usePendingApprovals, useResolveApproval } from '@shared/stores/toolApprovalStore';

const ToolApprovalBanner: React.FC = () => {
  const pending = usePendingApprovals();
  const resolveApproval = useResolveApproval();

  const request = pending[0];
  if (!request) return null;
  const queued = pending.length - 1;

  return (
    <div className="px-12 pb-1.5">
      <div
        className={`${SURFACE.input} border ${BORDER.default} rounded-2xl px-4 py-3 space-y-2`}
        role="alertdialog"
        aria-label="Tool permission"
      >
        <div className="flex items-start gap-2">
          <ShieldQuestion className={`w-4 h-4 mt-0.5 shrink-0 ${TEXT.secondary}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${TEXT.primary}`}>
              Allow <span className="font-medium">{request.serverName}</span> to run{' '}
              <span className="font-mono">{request.toolName}</span>?
            </p>
            {queued > 0 && (
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>{queued} more waiting</p>
            )}
          </div>
        </div>

        {request.argsPreview !== '{}' && (
          <pre className={`${SURFACE.inset} ${COMPONENT.argsPreview} ${TEXT.secondary}`}>
            {request.argsPreview}
          </pre>
        )}

        <div className="flex items-center justify-end gap-1.5">
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
      </div>
    </div>
  );
};

export default ToolApprovalBanner;
