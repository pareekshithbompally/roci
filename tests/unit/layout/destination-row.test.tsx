import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { CalendarDays, ListTodo } from 'lucide-react';
import { DestinationRow } from '@features/layout/components/DestinationRow';
import { useAppStore } from '@shared/stores/appStore';
import { startSidebarSearch, useSidebarSearchActive } from '@shared/stores/sidebarSearchStore';
import { TODOS_CONFIG } from '@config/todos.config';
import { CALENDAR_CONFIG } from '@config/calendar.config';

const rows = () => (
  <>
    <DestinationRow view="reminders" icon={ListTodo} label={TODOS_CONFIG.title} />
    <DestinationRow view="calendar" icon={CalendarDays} label={CALENDAR_CONFIG.title} />
  </>
);
const row = (name: string) => screen.getByRole('button', { name });

describe('sidebar destination rows (To-dos, Upcoming)', () => {
  beforeEach(() => useAppStore.getState().setCurrentView('home'));

  it('opens its place and ends a sidebar search', () => {
    startSidebarSearch();
    render(rows());
    fireEvent.click(row(TODOS_CONFIG.title));
    expect(useAppStore.getState().currentView).toBe('reminders');
    expect(renderHook(() => useSidebarSearchActive()).result.current).toBe(false);
    fireEvent.click(row(CALENDAR_CONFIG.title));
    expect(useAppStore.getState().currentView).toBe('calendar');
  });

  it('marks only the open place as current', () => {
    const { rerender } = render(rows());
    expect(row(TODOS_CONFIG.title)).not.toHaveAttribute('aria-current');
    expect(row(CALENDAR_CONFIG.title)).not.toHaveAttribute('aria-current');
    useAppStore.getState().setCurrentView('calendar');
    rerender(rows());
    expect(row(CALENDAR_CONFIG.title)).toHaveAttribute('aria-current', 'page');
    expect(row(TODOS_CONFIG.title)).not.toHaveAttribute('aria-current');
  });
});
