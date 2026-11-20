/** Storage domain — Keep policies applied in one transaction. */

import { call } from '@services/db/internal';
import type { PurgeResult, StorageUsage } from '@shared/types/native';
import type { StorageRetention } from '@shared/types';

export const storage = {
  /** Removes everything older than its class's keep days; returns what went and when the next item comes due. */
  async purge(keepDays: StorageRetention): Promise<PurgeResult> {
    return call<PurgeResult>('storage_purge', { keepDays });
  },

  /** Counts, and bytes measured from disk now: each file kind, the database, the cache and downloaded models. */
  async usage(): Promise<StorageUsage> {
    return call<StorageUsage>('storage_usage');
  },
};
