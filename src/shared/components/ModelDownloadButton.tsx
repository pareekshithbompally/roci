/** On-device model row controls: a Ready status and one fixed-width Download / progress / Delete action. */

import React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { LAYOUT } from '@config/layout.config';
import { Button, Icon, Status, cn } from '@shared/ui';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';

export const ModelReadyStatus: React.FC<{ model: OnDeviceModel }> = ({ model }) =>
  model.status === 'ready' ? <Status tone="success">Ready</Status> : null;

interface ModelDownloadButtonProps {
  model: OnDeviceModel;
  /** Offer Delete once ready (Settings); elsewhere a ready model shows no action. */
  removable?: boolean;
}

export const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({ model, removable }) => {
  if (model.status === 'ready') {
    if (!removable) return null;
    return (
      <Button variant="dangerGhost" size="sm" onClick={model.remove} className={cn(LAYOUT.modelAction, 'shrink-0')}>
        <Icon icon={Trash2} size="xs" />
        Delete
      </Button>
    );
  }

  const busy = model.status === 'busy';
  return (
    <Button variant="outline" size="sm" loading={busy} onClick={model.download} className={cn(LAYOUT.modelAction, 'shrink-0 tabular-nums')}>
      {!busy && <Icon icon={Download} size="xs" />}
      {busy ? (model.percent != null ? `${model.percent}%` : 'Preparing…') : 'Download'}
    </Button>
  );
};
