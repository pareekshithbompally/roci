/** Categories domain — list/create/rename/delete meeting categories. */

import { call } from '@services/db/internal';
import type { CategoryRow } from '@shared/types/native';

export const categories = {
  /** List all categories. */
  async list(): Promise<CategoryRow[]> {
    return call<CategoryRow[]>('categories_list');
  },

  /** Create a new category. */
  async create(name: string): Promise<CategoryRow> {
    return call<CategoryRow>('categories_create', { name });
  },

  /** Rename a category. */
  async rename(id: string, name: string): Promise<void> {
    await call<void>('categories_rename', { id, name });
  },

  /** Delete a category (junction cascades). */
  async delete(id: string): Promise<void> {
    await call<void>('categories_delete', { id });
  },
};
