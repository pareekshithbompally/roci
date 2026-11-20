/** Assets domain — every file Roci keeps is one row with at most one parent; deleting the row deletes the file. */

import { call } from '@services/db/internal';
import type { AssetRow, NewAsset, OwedNotice } from '@shared/types/native';

export const assets = {
  /** Registers a file just written; unclaimed until a chat save references it. Returns the asset id. */
  async create(asset: NewAsset): Promise<string> {
    return call<string>('assets_create', { asset });
  },

  /** Every asset of one kind, newest first. */
  async list(kind: string): Promise<AssetRow[]> {
    return call<AssetRow[]>('assets_list', { kind });
  },

  /** Whether the file at this app-data path is still kept. */
  async exists(path: string): Promise<boolean> {
    return call<boolean>('assets_exists', { path });
  },

  /** To-do notices still scheduled in macOS whose reminder went with its parent. */
  async noticesOwed(): Promise<OwedNotice[]> {
    return call<OwedNotice[]>('notices_owed');
  },

  async noticesCleared(ids: number[]): Promise<void> {
    await call<void>('notices_cleared', { ids });
  },
};
