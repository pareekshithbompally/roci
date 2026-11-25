import { describe, expect, it } from 'vitest';
import { activityDetail, activityMark, activitySummary, isSettled, playbackItem, sortActivity } from '@shared/components/activity/activityModel';
import type { ActivityItem } from '@shared/stores/activityStore';

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: 'x', type: 'processing', label: 'Transcribing', status: 'active', percent: null, step: null, detail: null, error: null, actions: [], ...over,
});
const action = (icon: string) => ({ icon, label: icon, onClick: () => {} });

describe('activity model', () => {
  it('orders recordings first, then running before finished', () => {
    const sorted = sortActivity([
      item({ id: 'd', type: 'download' }),
      item({ id: 'p-done', status: 'complete' }),
      item({ id: 'p' }),
      item({ id: 'r', type: 'recording' }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['r', 'p', 'p-done', 'd']);
  });

  it('marks each state', () => {
    expect(activityMark(item({ type: 'recording', actions: [action('pause'), action('square')] }))).toEqual({ kind: 'dot', tone: 'danger', pulse: true });
    expect(activityMark(item({ type: 'recording', actions: [action('play'), action('square')] }))).toEqual({ kind: 'dot', tone: 'warning', pulse: false });
    expect(activityMark(item({ type: 'recording', actions: [action('sparkles')] }))).toEqual({ kind: 'dot', tone: 'info', pulse: false });
    expect(activityMark(item({ type: 'download', status: 'waiting' }))).toEqual({ kind: 'glyph', glyph: 'download' });
    expect(activityMark(item({ id: 'local-model:chat', status: 'active' }))).toEqual({ kind: 'spinner' });
    expect(activityMark(item({ status: 'error' }))).toEqual({ kind: 'glyph', glyph: 'failed' });
    expect(activityMark(item({ status: 'complete' }))).toEqual({ kind: 'glyph', glyph: 'done' });
  });

  it('builds the detail line from what the item carries', () => {
    expect(activityDetail(item({ step: { current: 2, total: 4 }, detail: 'Part 2', percent: 40.4 }))).toBe('2/4 · Part 2 · 40%');
    expect(activityDetail(item({ status: 'error', detail: 'ignored', error: 'Network lost' }))).toBe('Network lost');
    expect(activityDetail(item({}))).toBeNull();
  });

  it('summarises one task by name and several by count', () => {
    expect(activitySummary([item({ label: 'Importing', percent: 40 })])).toBe('Importing · 40%');
    expect(activitySummary([item({ label: 'Loading Gemma…' })])).toBe('Loading Gemma…');
    expect(activitySummary([item({ type: 'recording', label: 'Recording', detail: '02:13' })])).toBe('Recording · 02:13');
    expect(activitySummary([item({}), item({ id: 'y' })])).toBe('2 tasks');
  });

  it('settled means finished one way or another', () => {
    expect([isSettled(item({ status: 'complete' })), isSettled(item({ status: 'active' })), isSettled(item({ status: 'waiting' }))]).toEqual([true, false, false]);
  });

  it('shows playing audio as an ordinary row: green dot (pulsing while it plays), clock as its detail, actions with Stop last', () => {
    const audio = { title: 'Standup', duration: 40, currentTime: 10, isPlaying: true, toggle: () => {}, skip: () => {}, stop: () => {} };
    const playing = playbackItem(audio);
    expect(activityMark(playing)).toEqual({ kind: 'dot', tone: 'success', pulse: true });
    expect(activityDetail(playing)).toBe('00:10 / 00:40');
    expect(playing.percent).toBe(25);
    expect(playing.actions.map((a) => a.icon)).toEqual(['pause', 'skip-forward', 'square']);
    const paused = playbackItem({ ...audio, isPlaying: false });
    expect(activityMark(paused)).toEqual({ kind: 'dot', tone: 'success', pulse: false });
    expect(paused.actions[0].icon).toBe('play');
  });
});
