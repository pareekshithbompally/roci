/** Usage domain — the AI-call log: write a call, read totals and a session's calls, price calls saved without a price.
 *  Row shapes belong to `@extensions/usage`, which owns pricing. */

import { call } from '@services/db/internal';

export const usage = {
  insert(record: unknown): Promise<void> {
    return call<void>('insert_usage', { record });
  },

  summary<T>(query: unknown): Promise<T> {
    return call<T>('get_usage_summary', { query });
  },

  sessionCalls<T>(sessionId: string): Promise<T[]> {
    return call<T[]>('get_session_usage', { sessionId });
  },

  unpriced<T>(provider: string, model: string): Promise<T[]> {
    return call<T[]>('unpriced_usage', { provider, model });
  },

  setCosts(costs: ReadonlyArray<{ id: string; cost: number }>): Promise<void> {
    return call<void>('set_usage_costs', { costs });
  },
};
