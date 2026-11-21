/** The saved memories and their entities, as one query: the Memory page, chat's prompt and the memory tools read the same cache. */

import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';

export const memoriesQuery = {
  queryKey: queryKeys.memories(),
  queryFn: () => store.memories.graph(),
};
