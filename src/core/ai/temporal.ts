/** Dates, times and the timezone, all local, formatted for LLM prompts. */

const pad = (n: number) => n.toString().padStart(2, '0');

const dateOf = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
const weekdayOf = (at: Date) => at.toLocaleDateString('en-US', { weekday: 'long' });
const timeOf = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Call once per LLM request and thread it through, so one request never sees two different times. */
export function formatTemporalContext(now = new Date()): string {
  return `Current date: ${dateOf(now)} (${weekdayOf(now)}). Time: ${timeOf(now)} local. Timezone: ${timezone()}.`;
}

/** The chat system prompt's time line: only what stays the same between turns, so the prompt's start can be cached. */
export function formatChatTimeContext(): string {
  return `Timezone: ${timezone()}. Each user message starts with when it was sent, in local time; the latest one is the current time.`;
}

/** When a chat message was sent, as it leads that message for the model; fixed once sent, so earlier turns never change. */
export function formatSentAt(timestamp: number): string {
  const at = new Date(timestamp);
  return `[Sent ${weekdayOf(at)} ${dateOf(at)} ${timeOf(at)}]`;
}
