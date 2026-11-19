/** Current date, time and timezone, all local, formatted for LLM system prompts. */

const pad = (n: number) => n.toString().padStart(2, '0');

/** Call once per LLM request and thread it through, so one request never sees two different times. */
export function formatTemporalContext(now = new Date()): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Current date: ${date} (${weekday}). Time: ${pad(now.getHours())}:${pad(now.getMinutes())} local. Timezone: ${timezone}.`;
}
