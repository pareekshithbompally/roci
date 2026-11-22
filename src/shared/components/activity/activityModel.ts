/** Activity maths: order, each row's mark and detail line, and the iPhone activity button's label; read from the store's items as they are. */

import type { ActivityItem, ActivityStatus, ActivityType } from '@shared/stores/activityStore';
import { formatClock } from '@shared/utils/formatters';
import { PLAYER_CONFIG } from '@config/player.config';
import type { MinimizedAudio } from './useMinimizedAudio';

/** Lower comes first: a recording always leads. */
const TYPE_ORDER: Record<ActivityType, number> = { playback: 0, recording: 1, processing: 2, import: 3, download: 4, indexing: 5 };
const STATUS_ORDER: Record<ActivityStatus, number> = { active: 0, waiting: 1, error: 2, complete: 3, cancelled: 4 };

export function sortActivity(items: readonly ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/** What leads a row: a recording's or playback's dot, a spinner while work runs, or a still glyph for waiting and finished states. */
export type ActivityMark =
  | { kind: 'dot'; tone: 'danger' | 'warning' | 'info' | 'success'; pulse: boolean }
  | { kind: 'spinner' }
  | { kind: 'glyph'; glyph: 'download' | 'waiting' | 'done' | 'failed' | 'cancelled' };

const hasAction = (item: ActivityItem, icon: string) => item.actions.some((a) => a.icon === icon);

export function activityMark(item: ActivityItem): ActivityMark {
  if (item.status === 'error') return { kind: 'glyph', glyph: 'failed' };
  if (item.status === 'complete') return { kind: 'glyph', glyph: 'done' };
  if (item.status === 'cancelled') return { kind: 'glyph', glyph: 'cancelled' };
  if (item.type === 'playback') return { kind: 'dot', tone: 'success', pulse: hasAction(item, 'pause') };
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
  // A playback row's clock already says where it is.
  const percent = item.percent === null || item.type === 'playback' ? null : `${Math.round(item.percent)}%`;
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

/** Audio playing away from its player as an activity row: the same anatomy as every other row (dot, title, clock, bar,
 *  actions on the right with Stop last). */
export function playbackItem(audio: MinimizedAudio): ActivityItem {
  const { skipSeconds } = PLAYER_CONFIG;
  return {
    id: 'playback',
    type: 'playback',
    label: audio.title,
    status: 'active',
    percent: audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : null,
    step: null,
    detail: `${formatClock(audio.currentTime)} / ${formatClock(audio.duration)}`,
    error: null,
    actions: [
      audio.isPlaying ? { icon: 'pause', label: 'Pause', onClick: audio.toggle } : { icon: 'play', label: 'Play', onClick: audio.toggle },
      { icon: 'skip-forward', label: `Skip forward ${skipSeconds} seconds`, onClick: audio.skip },
      { icon: 'square', label: 'Stop playback', onClick: audio.stop },
    ],
  };
}
