/** On-device model row controls: a Ready status and one fixed-width action — Download, then ■ 26% (tap cancels), then Delete. */

import React from 'react';
import { Download, Square, Trash2 } from 'lucide-react';
import { LAYOUT } from '@config/layout.config';
import { Button, Icon, IconButton, ProgressRing, Text, cn } from '@shared/ui';
import type { OnDeviceModel } from '@shared/utils/onDeviceModel';
import { useFormFactor } from '@platform/formFactor';
import { KIT_COPY } from '@config/kitCopy.config';

/** A model's download size in its own column before the action; it stays put through Download, progress and Delete. */
export const ModelSize: React.FC<{ size: string }> = ({ size }) => (
  <Text variant="figure" tone="muted" className={cn(useFormFactor() !== 'phone' && LAYOUT.modelSize, 'shrink-0')}>{size}</Text>
);

interface ModelDownloadButtonProps {
  model: OnDeviceModel;
  /** Offer Delete once ready (Settings); elsewhere a ready model shows no action. */
  removable?: boolean;
}

/** The compact form: one icon-sized control that keeps its place from Download to done. */
const CompactDownload: React.FC<{ model: OnDeviceModel }> = ({ model }) => {
  if (model.status === 'idle') return <IconButton icon={Download} label={KIT_COPY.download} size="sm" onClick={model.download} />;
  return (
    <Button variant="ghost" size="iconSm" onClick={model.cancel} aria-label={KIT_COPY.cancelDownload}>
      <ProgressRing percent={model.percent ?? 0}>
        <Icon icon={Square} size="xs" className="scale-50 fill-current" />
      </ProgressRing>
    </Button>
  );
};

export const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({ model, removable }) => {
  // A phone row has no room for labelled columns: the App Store's one icon control (⬇, ring with ■, ✓).
  const phone = useFormFactor() === 'phone';
  if (phone && model.status !== 'ready') return <CompactDownload model={model} />;
  if (model.status === 'ready') {
    if (!removable) return null;
    if (phone) return <IconButton icon={Trash2} label={KIT_COPY.delete} size="sm" variant="dangerGhost" onClick={model.remove} />;
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
      <Button variant="outline" size="sm" onClick={model.cancel} aria-label={KIT_COPY.cancelDownload} className={cn(LAYOUT.modelAction, 'shrink-0 tabular-nums')}>
        <Icon icon={Square} size="xs" className="fill-current" />
        {model.percent != null ? `${model.percent}%` : KIT_COPY.preparing}
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
