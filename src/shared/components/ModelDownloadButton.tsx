/** On-device model row controls: a Ready status and one fixed-width action — Download, then ■ 26% (tap cancels), then Delete. */

import React from 'react';
import { Check, Download, Square, Trash2 } from 'lucide-react';
import { LAYOUT } from '@config/layout.config';
import { Button, Icon, IconButton, ProgressRing, Status, Text, cn } from '@shared/ui';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';

/** A model's download size in its own column before the action; it stays put through Download, progress and Delete. */
export const ModelSize: React.FC<{ size: string }> = ({ size }) => (
  <Text variant="figure" tone="muted" className={cn(LAYOUT.modelSize, 'shrink-0')}>{size}</Text>
);

export const ModelReadyStatus: React.FC<{ model: OnDeviceModel }> = ({ model }) =>
  model.status === 'ready' ? <Status tone="success">Ready</Status> : null;

interface ModelDownloadButtonProps {
  model: OnDeviceModel;
  /** Offer Delete once ready (Settings); elsewhere a ready model shows no action. */
  removable?: boolean;
  /** An icon beside a picker (onboarding): ⬇, then a ring with a stop square while it downloads, then a tick. */
  compact?: boolean;
}

/** The compact form: one icon-sized control that keeps its place from Download to done. */
const CompactDownload: React.FC<{ model: OnDeviceModel }> = ({ model }) => {
  if (model.status === 'ready') return <Icon icon={Check} size="sm" tone="success" />;
  if (model.status === 'idle') return <IconButton icon={Download} label="Download" size="sm" onClick={model.download} />;
  return (
    <Button variant="ghost" size="iconSm" onClick={model.cancel} aria-label="Cancel download">
      <ProgressRing percent={model.percent ?? 0}>
        <Icon icon={Square} size="xs" className="scale-50 fill-current" />
      </ProgressRing>
    </Button>
  );
};

export const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({ model, removable, compact }) => {
  if (compact) return <CompactDownload model={model} />;
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
