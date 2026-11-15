/**
 * ModelDownloadButton — the one control for an on-device model download.
 *
 *   idle   [⬇ Download]
 *   busy   [◌ Preparing…] → [◌ 42%] → [◌ Preparing…] (initializing) — one
 *          button that stays in place; only its glyph and label change
 *   ready  ● Ready  (+ [↻ Re-download] or [🗑 Delete] in Settings) — the kit Status, like every row state
 *
 * Errors return to idle; the error toast carries Retry.
 */

import React from 'react';
import { Download, RotateCw, Trash2 } from 'lucide-react';
import { Button, Icon, Status } from '@shared/ui';
import type { OnDeviceModel } from '@shared/hooks/useOnDeviceModel';

interface ModelDownloadButtonProps {
  model: OnDeviceModel;
  /** Offer Re-download next to Ready (Settings). */
  allowRedownload?: boolean;
  /** Offer Delete next to Ready: the model's files are removed (it asks first). */
  onRemove?: () => void;
}

export const ModelDownloadButton: React.FC<ModelDownloadButtonProps> = ({ model, allowRedownload, onRemove }) => {
  if (model.status === 'ready') {
    return (
      // gap-3 = CardRow's status → actions spacing, so Ready sits like every row state.
      <div className="flex items-center gap-3">
        <Status tone="success">Ready</Status>
        {allowRedownload && (
          <Button variant="ghost" size="sm" onClick={model.redownload}>
            <Icon icon={RotateCw} size="xs" />
            Re-download
          </Button>
        )}
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Icon icon={Trash2} size="xs" />
            Delete
          </Button>
        )}
      </div>
    );
  }

  const busy = model.status === 'busy';
  return (
    <Button variant="outline" size="sm" loading={busy} onClick={model.download} className="tabular-nums">
      {!busy && <Icon icon={Download} size="xs" />}
      {busy ? (model.percent != null ? `${model.percent}%` : 'Preparing…') : 'Download'}
    </Button>
  );
};
