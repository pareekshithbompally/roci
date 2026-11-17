/** Activity maths: order, each row's mark and detail line, and the iPhone activity button's label; read from the store's items as they are. */

import type { ActivityItem, ActivityStatus, ActivityType } from '@shared/stores/activityStore';

/** Lower comes first: a recording always leads. */
const TYPE_ORDER: Record<ActivityType, number> = { recording: 0, processing: 1, import: 2, download: 3, indexing: 4 };
const STATUS_ORDER: Record<ActivityStatus, number> = { active: 0, waiting: 1, error: 2, complete: 3, cancelled: 4 };

export function sortActivity(items: readonly ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/** What leads a row: a recording's dot, a spinner while work runs, or a still glyph for waiting and finished states. */
export type ActivityMark =
  | { kind: 'dot'; tone: 'danger' | 'warning' | 'info'; pulse: boolean }
  | { kind: 'spinner' }
  | { kind: 'glyph'; glyph: 'download' | 'waiting' | 'done' | 'failed' | 'cancelled' };

const hasAction = (item: ActivityItem, icon: string) => item.actions.some((a) => a.icon === icon);

export function activityMark(item: ActivityItem): ActivityMark {
  if (item.status === 'error') return { kind: 'glyph', glyph: 'failed' };
  if (item.status === 'complete') return { kind: 'glyph', glyph: 'done' };
  if (item.status === 'cancelled') return { kind: 'glyph', glyph: 'cancelled' };
  if (item.type === 'recording') {
    if (hasAction(item, 'play')) return { kind: 'dot', tone: 'warning', pulse: false };
    if (hasAction(item, 'square')) return { kind: 'dot', tone: 'danger', pulse: true };
    return { kind: 'dot', tone: 'info', pulse: false };
  }
  if (item.status === 'waiting') return { kind: 'glyph', glyph: item.type === 'download' ? 'download' : 'waiting' };
  return { kind: 'spinner' };
}

/** "2/4 · 120 MB of 300 MB · 40%": step, then the reason (on failure) or detail, then percent. */
export function activityDetail(item: ActivityItem): string | null {
  const step = item.step ? `${item.step.current}/${item.step.total}` : null;
  const note = item.status === 'error' ? item.error : item.detail;
  const percent = item.percent === null ? null : `${Math.round(item.percent)}%`;
  return [step, note, percent].filter(Boolean).join(' · ') || null;
}

/** Finished rows the user can clear. */
export const isSettled = (item: ActivityItem) => item.status === 'complete' || item.status === 'error' || item.status === 'cancelled';

/** The activity button's label: one task by name (with its percent, or a recording's clock), several by count. */
export function activitySummary(items: readonly ActivityItem[]): string {
  if (items.length === 1) {
    const [item] = items;
    if (item.percent !== null) return `${item.label} · ${Math.round(item.percent)}%`;
    return item.type === 'recording' && item.detail ? `${item.label} · ${item.detail}` : item.label;
  }
  return `${items.length} tasks`;
}
