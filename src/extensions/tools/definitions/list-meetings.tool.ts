/** list_meetings: meetings newest first, optionally within a date range, read from roci.db. */

import { z } from 'zod';
import { day, defineTool, limit, localDay, ok, toolDate } from '@extensions/tools/contract';
import { currentMeetings } from '@extensions/tools/data';

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
    const inRange = (await currentMeetings()).filter((meeting) => {
      const on = localDay(meeting.timestamp);
      return (!from_date || on >= from_date) && (!to_date || on <= to_date);
    });
    const range = from_date || to_date ? ` from ${from_date ?? 'the first'} to ${to_date ?? 'today'}` : '';
    if (inRange.length === 0) return ok(`No meetings${range}.`, { resultCount: 0 });

    const shown = inRange.sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
    const lines = shown.map((m, i) => `${i + 1}. "${m.title}" — ${toolDate(m.timestamp)} — ID: ${m.id}`);
    return ok([`Meetings${range} (showing ${shown.length} of ${inRange.length}):`, '', ...lines].join('\n'), { resultCount: shown.length });
  },
});
