/** One session's AI calls (a meeting, a dictation) from the usage log: one query per session, shared by everything
 *  that reads it; a call logged for the session updates it. */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getSessionUsage, sessionCostOf, type SessionCost, type SessionUsage } from '@extensions/usage';
import { queryKeys } from '@shared/query/queryKeys';

const sessionUsageOptions = (sessionId: string) =>
  queryOptions({ queryKey: queryKeys.sessionUsage(sessionId), queryFn: () => getSessionUsage(sessionId), staleTime: Infinity });

/** What `select` reads from the session's calls; undefined while loading or with no session. Pass a stable `select`
 *  (module-level or memoised) so it runs only when the calls change. */
export function useSessionUsage<T>(sessionId: string | null | undefined, select: (usage: SessionUsage[]) => T): T | undefined {
  return useQuery({ ...sessionUsageOptions(sessionId ?? ''), enabled: !!sessionId, select }).data;
}

/** What the session's calls cost; null with none logged. */
export function useSessionCost(sessionId: string | null | undefined): SessionCost | null | undefined {
  return useSessionUsage(sessionId, sessionCostOf);
}
