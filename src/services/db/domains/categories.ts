/** Categories domain — list meeting categories. */

import { call } from '@services/db/internal';
import type { CategoryRow } from '@shared/types/native';

export const categories = {
  /** List all categories. */
  async list(): Promise<CategoryRow[]> {
    return call<CategoryRow[]>('categories_list');
  },
};
