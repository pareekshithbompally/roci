/** To-dos: every meeting's action items, grouped by meeting, filterable, with create support; opened from the sidebar row. */

import React, { useCallback, useState } from 'react';
import { Inbox, Search, Plus, X } from 'lucide-react';
import { useGlobalTodos } from '@features/todos/hooks/useGlobalTodos';
import type { TodoFilter } from '@features/todos/hooks/useGlobalTodos';
import type { GlobalTodoEntry } from '@services/db';
import { IconButton, SearchField, Surface, Tabs, Text, ViewHeader, ViewScroll, cn } from '@shared/ui';
import { ScreenState } from '@shared/components';
import { formatMeetingDate } from '@shared/utils/todo.utils';
import { NewTodoForm } from './NewTodoForm';
import TodoItem from './TodoItem';
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
  todo: GlobalTodoEntry;
  onToggle: (meetingId: string | null, todoId: string) => void;
  onReminderChanged: () => void;
}

const TodoRow: React.FC<TodoRowProps> = ({ todo, onToggle, onReminderChanged }) => (
  <TodoItem
    todo={todo}
    meetingId={todo.meetingId}
    meetingTitle={todo.meetingTitle}
    onToggle={() => onToggle(todo.meetingId, todo.id)}
    onReminderChange={onReminderChanged}
    className={LAYOUT.listGutter}
  />
);

// ── Main component ──────────────────────────────────────────────

export const RemindersView: React.FC = () => {
  const { groups, filter, setFilter, searchQuery, setSearchQuery, toggleTodo, addTodo, refresh, counts, isLoading } = useGlobalTodos();
  const [isCreating, setIsCreating] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleToggle = useCallback(async (meetingId: string | null, todoId: string) => {
    await toggleTodo(meetingId, todoId);
  }, [toggleTodo]);

  const handleSearchToggle = useCallback(() => {
    if (isSearchOpen) {
      setSearchQuery('');
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
    }
  }, [isSearchOpen, setSearchQuery]);

  const hasContent = groups.length > 0;

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
      {/* Title and counts (or the search field), Search and Add; the filters under it */}
      <ViewHeader
        title={TODOS_CONFIG.title}
        detail={counts.total > 0 && `${counts.pending} pending · ${counts.completed} done`}
        replaceTitle={isSearchOpen && (
          <>
            <SearchField value={searchQuery} onChange={setSearchQuery} onCancel={handleSearchToggle} autoFocus className="flex-1" />
            <IconButton icon={X} label="Close search" size="sm" onClick={handleSearchToggle} />
          </>
        )}
        accessory={
          <>
            {!isSearchOpen && <IconButton icon={Search} label="Search to-dos" size="sm" onClick={handleSearchToggle} />}
            <IconButton icon={Plus} label={TODOS_CONFIG.add} size="sm" onClick={() => setIsCreating(true)} disabled={isCreating} />
          </>
        }
      >
        <Tabs items={filterTabs} value={filter} onValueChange={setFilter} />
      </ViewHeader>

      {/* The list in the page column; no fade, as each meeting's heading pins to the top. */}
      <ViewScroll fade={false}>
        <NewTodoForm open={isCreating} onClose={() => setIsCreating(false)} onSubmit={addTodo} />

        <ScreenState
          loading={isLoading}
          empty={!hasContent && {
            icon: searchQuery ? Search : Inbox,
            message: searchQuery
              ? 'No matching to-dos'
              : filter === 'all' ? 'No to-dos yet' : `No ${filter} to-dos`,
            description: searchQuery
              ? 'Try different keywords or clear your search'
              : filter === 'all'
                ? 'To-dos from your meetings will appear here'
                : 'Try a different filter to see more items',
          }}
          className="py-2"
        >
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
                    onReminderChanged={refresh}
                  />
                ))}
              </div>
            </div>
          ))}
        </ScreenState>
      </ViewScroll>
    </div>
  );
};

export default RemindersView;
