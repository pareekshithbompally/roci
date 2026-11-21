/** The single TS entry for DB operations; each mutation is a Rust store command in one SQLite transaction. */

import { call } from './internal';
import type { IndexStats, SessionSearchHit, SessionSearchParams } from './types';
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
import { memories } from './domains/memories';
import { knowledge } from './domains/knowledge';

export const store = {
  /** Initialize the database — must be called once before any other operation. */
  async initialize(): Promise<void> {
    await call<void>('initialize');
  },

  /** The search index's counts (Settings › Search Index). */
  async indexStats(): Promise<IndexStats> {
    return call<IndexStats>('index_stats');
  },

  /** The ⌘K search over meeting and chat titles and contents, as you type. */
  async searchSessions(params: SessionSearchParams): Promise<SessionSearchHit[]> {
    return call<SessionSearchHit[]>('search_sessions', { params });
  },

  meetings,
  items,
  memories,
  knowledge,
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
