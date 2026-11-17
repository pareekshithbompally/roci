import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { TodosRow } from '@features/layout/components/TodosRow';
import { useAppStore } from '@shared/stores/appStore';
import { startSidebarSearch, useSidebarSearchActive } from '@shared/stores/sidebarSearchStore';
import { TODOS_CONFIG } from '@config/todos.config';

describe('To-dos sidebar row', () => {
  beforeEach(() => useAppStore.getState().setCurrentView('home'));

  it('opens To-dos and ends a sidebar search', () => {
    startSidebarSearch();
    render(<TodosRow />);
    fireEvent.click(screen.getByRole('button', { name: TODOS_CONFIG.title }));
    expect(useAppStore.getState().currentView).toBe('reminders');
    expect(renderHook(() => useSidebarSearchActive()).result.current).toBe(false);
  });

  it('is the current page only while To-dos is open', () => {
    const { rerender } = render(<TodosRow />);
    const row = () => screen.getByRole('button', { name: TODOS_CONFIG.title });
    expect(row()).not.toHaveAttribute('aria-current');
    useAppStore.getState().setCurrentView('reminders');
    rerender(<TodosRow />);
    expect(row()).toHaveAttribute('aria-current', 'page');
    useAppStore.getState().setCurrentView('calendar');
    rerender(<TodosRow />);
    expect(row()).not.toHaveAttribute('aria-current');
  });
});
