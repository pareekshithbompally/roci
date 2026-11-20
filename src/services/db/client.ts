/** The single TS entry for DB operations; each mutation is a Rust store command in one SQLite transaction. */

import { call } from './internal';
import type { StoreMeta } from './types';
import { meetings } from './domains/meetings';
import { assets } from './domains/assets';
import { storage } from './domains/storage';
import { notes } from './domains/notes';
import { todos } from './domains/todos';
import { reminders } from './domains/reminders';
import { settings } from './domains/settings';
import { providers } from './domains/providers';
import { categories } from './domains/categories';
import { chats } from './domains/chats';
import { dictations } from './domains/dictations';
import { items } from './domains/items';

export const store = {
  /** Initialize the database — must be called once before any other operation. */
  async initialize(): Promise<void> {
    await call<void>('initialize');
  },

  /** Return index metadata (schema version, embedding model, dimensions). */
  async getMeta(): Promise<StoreMeta> {
    return call<StoreMeta>('get_meta');
  },

  /** Return database statistics. */
  async getStats(): Promise<unknown> {
    return call<unknown>('get_stats');
  },

  meetings,
  items,
  assets,
  storage,
  notes,
  todos,
  reminders,
  settings,
  providers,
  categories,
  chats,
  dictations,
};
