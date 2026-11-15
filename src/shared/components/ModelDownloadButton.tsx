/**
 * An on-device model's row controls, in two parts a row places in its own
 * slots (CardRow `status` / `actions`), so states and actions line up down a card:
 *
 *   ModelReadyStatus      ● Ready once downloaded; nothing before.
 *   ModelDownloadButton   one fixed-width action that changes in place:
 *     idle   [⬇ Download]
 *     busy   [◌ Preparing…] → [◌ 42%] → [◌ Preparing…] (initializing)
 *     ready  [↻ Re-download] or [🗑 Delete] where offered; otherwise none
 *
 * Errors return to idle; the error toast carries Retry.
 */

import React from 'react';
import { Download, RotateCw, Trash2 } from 'lucide-react';
import { LAYOUT } from '@config/layout.config';
import { Button, Icon, Status } from '@shared/ui';
import type { OnDeviceModel } from '@shared/hooks/useOnDeviceModel';

export const ModelReadyStatus: React.FC<{ model: OnDeviceModel }> = ({ model }) =>
  model.status === 'ready' ? <Status tone="success">Ready</Status> : null;

interface ModelDownloadButtonProps {
  model: OnDeviceModel;
  /** Offer Re-download once ready (Settings). */
  allowRedownload?: boolean;
  /** Offer Delete once ready: the model's files are removed (it asks first). */
  onRemove?: () => void;
}

export const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({ model, allowRedownload, onRemove }) => {
  if (model.status === 'ready') {
    if (onRemove) {
      return (
        <Button variant="ghost" size="sm" onClick={onRemove} className={LAYOUT.modelAction}>
          <Icon icon={Trash2} size="xs" />
          Delete
        </Button>
      );
    }
    if (!allowRedownload) return null;
    return (
      <Button variant="ghost" size="sm" onClick={model.redownload} className={LAYOUT.modelAction}>
        <Icon icon={RotateCw} size="xs" />
        Re-download
      </Button>
    );
  }

  const busy = model.status === 'busy';
  return (
    <Button variant="outline" size="sm" loading={busy} onClick={model.download} className={`${LAYOUT.modelAction} tabular-nums`}>
      {!busy && <Icon icon={Download} size="xs" />}
      {busy ? (model.percent != null ? `${model.percent}%` : 'Preparing…') : 'Download'}
    </Button>
  );
};
