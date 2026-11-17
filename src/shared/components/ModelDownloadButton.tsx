/** On-device model row controls: a Ready status and one fixed-width action — Download, then ■ 26% (tap cancels), then Delete. */

import React from 'react';
import { Download, Square, Trash2 } from 'lucide-react';
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

  if (model.status === 'busy') {
    // App Store style: the download's own button stops it.
    return (
      <Button variant="outline" size="sm" onClick={model.cancel} aria-label="Cancel download" className={cn(LAYOUT.modelAction, 'shrink-0 tabular-nums')}>
        <Icon icon={Square} size="xs" className="fill-current" />
        {model.percent != null ? `${model.percent}%` : 'Preparing…'}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={model.download} className={cn(LAYOUT.modelAction, 'shrink-0')}>
      <Icon icon={Download} size="xs" />
      Download
    </Button>
  );
};
