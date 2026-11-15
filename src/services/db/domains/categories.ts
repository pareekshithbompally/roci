/** Categories domain — list/create/rename/delete meeting categories. */

import { call, type RustCategoryRow } from '@services/db/internal';

export const categories = {
  /** List all categories. */
  async list(): Promise<RustCategoryRow[]> {
    return call<RustCategoryRow[]>('categories_list');
  },

  /** Create a new category. */
  async create(name: string): Promise<RustCategoryRow> {
    return call<RustCategoryRow>('categories_create', { name });
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
