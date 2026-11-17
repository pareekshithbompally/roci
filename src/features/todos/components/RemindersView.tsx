/** To-dos: every meeting's action items, grouped by meeting, filterable, with create support; opened from the sidebar row. */

import React, { useCallback, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, Inbox, Search, Plus, X } from 'lucide-react';
import { useGlobalTodos } from '@features/todos/hooks/useGlobalTodos';
import type { TodoFilter, GlobalTodo } from '@features/todos/hooks/useGlobalTodos';
import { Button, Checkbox, Icon, IconButton, Input, Surface, Tabs, Text, TitlebarSpacer, cn } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { isOverdue, formatDueDate, formatReminderDate, isReminderOverdue, formatMeetingDate } from '@shared/utils/todo.utils';
import { NewTodoForm } from './NewTodoForm';
import ReminderPicker from './ReminderPicker';
import { platform } from '@platform/index';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { TODOS_CONFIG } from '@config/todos.config';

// ── Filter chip config ──────────────────────────────────────────

const FILTERS: { key: TodoFilter; label: string; countKey: 'total' | 'pending' | 'completed' }[] = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'completed', label: 'Completed', countKey: 'completed' },
];

// ── Todo row ────────────────────────────────────────────────────

interface TodoRowProps {
  todo: GlobalTodo;
  onToggle: (meetingId: string | null, todoId: string) => void;
  onReminderSet: (meetingId: string | null, todoId: string, todoText: string, meetingTitle: string | null, dateTime: string | null) => void;
}

const TodoRow: React.FC<TodoRowProps> = ({ todo, onToggle, onReminderSet }) => {
  const overdue = !todo.completed && isOverdue(todo.dueDate);
  const reminderOverdue = todo.reminder ? isReminderOverdue(todo.reminder) : false;

  const handleReminderSet = useCallback((dateTime: string | null) => {
    onReminderSet(todo.meetingId, todo.id, todo.text, todo.meetingTitle, dateTime);
  }, [todo.meetingId, todo.id, todo.text, todo.meetingTitle, onReminderSet]);

  return (
    <div className={`w-full flex items-start gap-2.5 ${LAYOUT.listGutter} py-2 group`}>
      <Checkbox
        checked={todo.completed}
        onCheckedChange={() => onToggle(todo.meetingId, todo.id)}
        className="mt-1"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Text as="p" variant="reading" tone={todo.completed ? 'faint' : 'primary'} className={cn('break-words', todo.completed && 'line-through')}>
          {todo.text}
        </Text>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
          {/* Due date */}
          {todo.dueDate && (
            <Text variant="helper" tone={overdue ? 'danger' : 'muted'} className="inline-flex items-center gap-1">
              <Icon icon={overdue ? AlertTriangle : CalendarDays} size="xs" />
              {overdue ? 'Overdue: ' : 'Due: '}{formatDueDate(todo.dueDate)}
            </Text>
          )}

          {/* Reminder */}
          {todo.reminder && !todo.completed && (
            <Text variant="helper" tone={reminderOverdue ? 'danger' : 'warning'} className="inline-flex items-center gap-1">
              <Icon icon={Bell} size="xs" />
              {reminderOverdue ? 'Overdue: ' : ''}{formatReminderDate(todo.reminder.dateTime)}
            </Text>
          )}

          {/* Owner */}
          {todo.owner && (
            <Text variant="helper" tone="faint">
              → {todo.owner}
            </Text>
          )}
        </div>
      </div>

      {/* Reminder bell — always visible when active, hover when not */}
      {platform.hasNotifications && !todo.completed && (
        <div className={cn('shrink-0 transition-opacity', !todo.reminder && 'opacity-0 group-hover:opacity-100')}>
          <ReminderPicker
            todoId={todo.id}
            meetingId={todo.meetingId}
            todoText={todo.text}
            meetingTitle={todo.meetingTitle}
            reminderDateTime={todo.reminder?.dateTime}
            dueDate={todo.dueDate}
            onReminderSet={handleReminderSet}
          />
        </div>
      )}
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────

export const RemindersView: React.FC = () => {
  const phone = useFormFactor() === 'phone';
  const { groups, filter, setFilter, searchQuery, setSearchQuery, toggleTodo, addTodo, setReminder, counts, isLoading } = useGlobalTodos();
  const [isCreating, setIsCreating] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const handleToggle = useCallback(async (meetingId: string | null, todoId: string) => {
    await toggleTodo(meetingId, todoId);
  }, [toggleTodo]);

  const handleSearchToggle = useCallback(() => {
    if (isSearchOpen) {
      setSearchQuery('');
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isSearchOpen, setSearchQuery]);

  const hasContent = groups.length > 0 || isCreating;

  const filterTabs = FILTERS.map(({ key, label, countKey }) => {
    const count = counts[countKey];
    return {
      value: key,
      label: (
        <>
          {label}
          {count > 0 && <span className={cn('ml-1.5', filter !== key && 'opacity-60')}>{count}</span>}
        </>
      ),
    };
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      <TitlebarSpacer />
      {/* Header: title and counts (or the search field), Search and Add; the filters under it */}
      <Surface as="header" edge="bottom" className={`shrink-0 ${LAYOUT.listGutter} pt-2 pb-3 space-y-3`}>
        <div className="flex items-center gap-2">
          {isSearchOpen ? (
            <>
              <Input
                icon={Search}
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                onKeyDown={(e) => { if (e.key === 'Escape') handleSearchToggle(); }}
              />
              <IconButton icon={X} label="Close search" size="sm" onClick={handleSearchToggle} />
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <Text as="h1" variant="pageTitle" truncate>{TODOS_CONFIG.title}</Text>
                {counts.total > 0 && (
                  <Text as="p" variant="helper" tone="muted">{counts.pending} pending · {counts.completed} done</Text>
                )}
              </div>
              <IconButton icon={Search} label="Search to-dos" size="sm" onClick={handleSearchToggle} />
            </>
          )}
          {phone ? (
            <IconButton icon={Plus} label={TODOS_CONFIG.add} size="sm" onClick={() => setIsCreating(true)} disabled={isCreating} />
          ) : (
            <Button variant="primary" size="sm" className="shrink-0" onClick={() => setIsCreating(true)} disabled={isCreating}>
              <Icon icon={Plus} size="xs" />
              {TODOS_CONFIG.add}
            </Button>
          )}
        </div>
        <Tabs items={filterTabs} value={filter} onValueChange={setFilter} fill={phone} />
      </Surface>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
        {/* Create form */}
        {/* New to-do: a sheet on iPhone, a card here on Mac. */}
        {phone
          ? <NewTodoForm open={isCreating} onClose={() => setIsCreating(false)} onSubmit={addTodo} />
          : isCreating && (
            <div className={`${LAYOUT.listGutter} pt-4`}>
              <NewTodoForm open onClose={() => setIsCreating(false)} onSubmit={addTodo} />
            </div>
          )}

        {isLoading ? (
          /* Loading skeleton */
          <div className={`${LAYOUT.listGutter} py-6 space-y-4`}>
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Surface variant="inset" radius="md" className="h-4 w-40 animate-pulse" />
                <Surface variant="inset" radius="lg" className="h-10 w-full animate-pulse" />
                <Surface variant="inset" radius="lg" className="h-10 w-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : !hasContent ? (
          <EmptyState
            icon={searchQuery ? Search : Inbox}
            message={searchQuery
              ? 'No matching to-dos'
              : filter === 'all' ? 'No to-dos yet' : `No ${filter} to-dos`}
            description={searchQuery
              ? 'Try different keywords or clear your search'
              : filter === 'all'
                ? 'To-dos from your meetings will appear here'
                : 'Try a different filter to see more items'}
          />
        ) : groups.length > 0 ? (
          /* Grouped list */
          <div className="py-2">
            {groups.map((group) => (
              <div key={group.meetingId ?? TODOS_CONFIG.general} className="mb-1">
                {/* Meeting header */}
                <Surface variant="page" edge="bottom" className={`sticky top-0 z-10 ${LAYOUT.listGutter} py-1.5 flex items-center gap-2`}>
                  <Text as="h2" variant="label" tone="muted" truncate>
                    {group.meetingTitle ?? TODOS_CONFIG.general}
                  </Text>
                  {group.meetingId && (
                    <Text variant="caption" tone="faint" className="shrink-0">
                      {formatMeetingDate(group.timestamp)}
                    </Text>
                  )}
                  <Text variant="caption" tone="faint" className="shrink-0 ml-auto">
                    {group.todos.filter(t => !t.completed).length}/{group.todos.length}
                  </Text>
                </Surface>

                {/* Todo items */}
                <div>
                  {group.todos.map((todo) => (
                    <TodoRow
                      key={`${todo.meetingId}-${todo.id}`}
                      todo={todo}
                      onToggle={handleToggle}
                      onReminderSet={setReminder}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default RemindersView;
