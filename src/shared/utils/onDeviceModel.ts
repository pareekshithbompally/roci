/** An on-device model's control as every surface shows it: its state, Download, and Delete (after a confirm). */

import { confirm } from '@shared/stores/confirmStore';

export type OnDeviceStatus = 'idle' | 'busy' | 'ready';

export interface OnDeviceModel {
  status: OnDeviceStatus;
  /** 0–100 once the download reports progress; null before that and while verifying. */
  percent: number | null;
  download: () => void;
  /** Asks first, then removes the model's files. */
  remove: () => void;
}

/** Asks before deleting a model: one confirm for every on-device model. */
export function confirmModelDelete(name: string, size: string): Promise<boolean> {
  return confirm({
    title: `Delete ${name}?`,
    description: `Frees ${size}. You can download it again anytime.`,
    confirmLabel: 'Delete',
    tone: 'danger',
  });
}
