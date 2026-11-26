/** Assets domain — every file Roci keeps is one row with at most one parent; deleting the row deletes the file. */

import { call } from '@services/db/internal';
import type { AssetRow, NewAsset, OwedNotice } from '@shared/types/native';
import type { ItemCursor } from './items';

export const assets = {
  /** Registers a file just written; unclaimed until a chat save references it. Returns the asset id. */
  async create(asset: NewAsset): Promise<string> {
    return call<string>('assets_create', { asset });
  },

  /** One page of `kind`'s files (only the kept ones: library documents, saved speech), newest first, after `before`. */
  async page(kind: string, kept: boolean, before: ItemCursor | null, limit: number): Promise<AssetRow[]> {
    return call<AssetRow[]>('assets_page', { kind, kept, before, limit });
  },

  /** Deletes a file kept in the library, with its passages and index state; files a meeting or chat owns go with it. */
  async remove(id: string): Promise<void> {
    await call<void>('assets_delete', { id });
  },

  /** Keep in Knowledge: the attached file at `path` joins the library and outlives its chat; throws when it is gone. */
  async keep(path: string): Promise<void> {
    await call<void>('assets_keep', { path });
  },

  /** How many files of `kind` there are (only the kept ones when `kept`). */
  async count(kind: string, kept: boolean): Promise<number> {
    return call<number>('assets_count', { kind, kept });
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
