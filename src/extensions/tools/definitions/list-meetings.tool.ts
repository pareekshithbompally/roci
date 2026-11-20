/** list_meetings: meetings newest first, optionally within a date range, read from roci.db. */

import { z } from 'zod';
import { day, defineTool, limit, ok, toolDate } from '@extensions/tools/contract';
import { fetchMeetings } from '@shared/query/items';

/** Local midnight of a YYYY-MM-DD day, `days` later (epoch ms); none without a day. */
function startOfDay(day: string | undefined, days = 0): number | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + days).getTime();
}

export const listMeetingsTool = defineTool({
  name: 'list_meetings',
  description:
    "List the user's recorded meetings, newest first, with each meeting's date and ID. Use it to browse meetings or " +
    'to find meetings on a date or in a date range (from_date / to_date), then read one with get_meeting. To find ' +
    'meetings by topic, use search_meetings.',
  input: z.object({
    limit: limit(10, 50),
    from_date: day.optional().describe('Only meetings on or after this day, YYYY-MM-DD.'),
    to_date: day.optional().describe('Only meetings on or before this day, YYYY-MM-DD.'),
  }),

  async execute({ limit: count, from_date, to_date }) {
    // One more than asked, so the reply can say there are more.
    const found = await fetchMeetings({ since: startOfDay(from_date), until: startOfDay(to_date, 1) }, count + 1);
    const range = from_date || to_date ? ` from ${from_date ?? 'the first'} to ${to_date ?? 'today'}` : '';
    if (found.length === 0) return ok(`No meetings${range}.`, { resultCount: 0 });

    const shown = found.slice(0, count);
    const more = found.length > count ? ' — there are more; narrow the dates or raise the limit' : '';
    const lines = shown.map((m, i) => `${i + 1}. "${m.title}" — ${toolDate(m.timestamp)} — ID: ${m.id}`);
    return ok([`Meetings${range} (newest ${shown.length}${more}):`, '', ...lines].join('\n'), { resultCount: shown.length });
  },
});
