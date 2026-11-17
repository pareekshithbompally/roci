import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ActivityCapsule } from '@shared/components/ActivityCapsule';
import { activityStore, type ActivityItem } from '@shared/stores/activityStore';

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: 'a', type: 'import', label: 'Importing call.m4a', status: 'active', percent: 40, step: null, detail: null, error: null, actions: [], ...over,
});

describe('iPhone activity capsule', () => {
  afterEach(() => act(() => activityStore.getSnapshot().forEach((i) => activityStore.remove(i.id))));

  it('is absent while nothing runs', () => {
    render(<ActivityCapsule />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names one task with its percent, counts several, and opens the sheet with every row', () => {
    render(<ActivityCapsule />);
    act(() => activityStore.add(item({})));
    expect(screen.getByRole('button', { name: /Importing call\.m4a · 40%/ })).toBeInTheDocument();

    act(() => activityStore.add(item({ id: 'mlx-model:chat', type: 'processing', label: 'Loading Gemma…', percent: null })));
    fireEvent.click(screen.getByRole('button', { name: /2 tasks/ }));
    expect(screen.getByRole('dialog', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('Loading Gemma…')).toBeInTheDocument();
    expect(screen.getAllByText('Importing call.m4a').length).toBeGreaterThan(0);
  });

  it('runs a row action from the sheet', () => {
    let cancelled = false;
    render(<ActivityCapsule />);
    act(() => activityStore.add(item({ actions: [{ icon: 'x', label: 'Cancel import', onClick: () => { cancelled = true; } }] })));
    fireEvent.click(screen.getByRole('button', { name: /Importing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    expect(cancelled).toBe(true);
  });
});
