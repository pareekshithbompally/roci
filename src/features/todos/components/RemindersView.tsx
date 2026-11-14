/**
 * RemindersView Component
 *
 * Full-screen view showing all todos/reminders across all meetings.
 * Navigated to via IdleView pill; uses same pattern as Settings view.
 * Grouped by meeting, filterable, searchable, with create support.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { ArrowLeft, ListTodo, AlertTriangle, Bell, CalendarDays, Inbox, Search, Plus, X, ChevronDown } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useGlobalTodos } from '@features/todos/hooks/useGlobalTodos';
import type { TodoFilter, GlobalTodo } from '@features/todos/hooks/useGlobalTodos';
import {
  Button, Checkbox, DatePicker, Icon, IconButton, Input, Popover, PopoverContent, PopoverTrigger,
  Row, Surface, Tabs, Text, Textarea, TimePicker, cn,
} from '@shared/ui';
import { EmptyState } from '@shared/components';
import { AppStatus } from '@shared/types';
import type { HistoryItem } from '@shared/types';
import { isOverdue, formatDueDate, formatReminderDate, isReminderOverdue, buildISOFromDateInput } from '@shared/utils/todo.utils';
import ReminderPicker from './ReminderPicker';

// ── Filter chip config ──────────────────────────────────────────

const FILTERS: { key: TodoFilter; label: string; countKey: 'total' | 'pending' | 'completed' }[] = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'completed', label: 'Completed', countKey: 'completed' },
];

// ── Date formatting helpers ─────────────────────────────────────

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ── Meeting selector ────────────────────────────────────────────

interface MeetingSelectorProps {
  items: HistoryItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const MeetingSelector: React.FC<MeetingSelectorProps> = ({ items, selectedId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = items.find(h => h.id === selectedId);
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 50);
    const lower = query.toLowerCase();
    return items.filter(h => (h.title || '').toLowerCase().includes(lower)).slice(0, 50);
  }, [items, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="md" className="w-full">
          <Text variant="helper" tone={selected ? 'primary' : 'faint'} truncate className="flex-1 text-left">
            {selected ? (selected.title || 'Untitled Meeting') : 'Select a meeting…'}
          </Text>
          <Icon icon={ChevronDown} size="xs" tone="faint" className="shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" width="trigger" className="max-h-60 overflow-hidden">
        {/* Search within selector */}
        <Surface edge="bottom" className="p-2">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings…"
            autoFocus
          />
        </Surface>

        <div className="overflow-y-auto max-h-48 custom-scrollbar p-1">
          {filtered.length === 0 ? (
            <Text as="div" variant="helper" tone="faint" className="px-3 py-4 text-center">No meetings found</Text>
          ) : (
            filtered.map(h => (
              <Row
                key={h.id}
                selected={h.id === selectedId}
                onClick={() => { onSelect(h.id); setOpen(false); setQuery(''); }}
              >
                <Text truncate className="flex-1">{h.title || 'Untitled Meeting'}</Text>
                <Text variant="caption" tone="faint" className="shrink-0">{formatDate(h.timestamp)}</Text>
              </Row>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Create todo form ────────────────────────────────────────────

interface CreateTodoFormProps {
  onSubmit: (meetingId: string, text: string, dueDate?: string) => Promise<void>;
  onCancel: () => void;
}

const CreateTodoForm: React.FC<CreateTodoFormProps> = ({ onSubmit, onCancel }) => {
  const { items: historyItems } = useHistoryData();
  const [text, setText] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() || !meetingId) return;

    const dueDateStr = date ? buildISOFromDateInput(date, time || undefined) : undefined;

    setIsSaving(true);
    try {
      await onSubmit(meetingId, text.trim(), dueDateStr);
      setText('');
      setMeetingId('');
      setDate('');
      setTime('');
      onCancel();
    } catch (error: unknown) {
      console.error('[CreateTodoForm] Failed to create todo:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit = text.trim().length > 0 && meetingId.length > 0 && !isSaving;

  return (
    <Surface variant="subtle" radius="xl" edge="all" className="p-4 space-y-3 animate-fade-in">
      {/* Todo text */}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What do you need to do?"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        className="h-16"
        autoFocus
      />

      {/* Meeting selector */}
      <div className="space-y-1.5">
        <Text as="label" variant="label" tone="muted" className="flex items-center gap-1.5">
          <Icon icon={ListTodo} size="xs" />
          Link to meeting
        </Text>
        <MeetingSelector
          items={historyItems}
          selectedId={meetingId}
          onSelect={setMeetingId}
        />
      </div>

      {/* Deadline picker */}
      <div className="space-y-1.5">
        <Text as="label" variant="label" tone="muted" className="flex items-center gap-1.5">
          <Icon icon={CalendarDays} size="xs" />
          Due date (optional)
        </Text>
        <div className="flex gap-2 items-center">
          <DatePicker
            value={date}
            onChange={setDate}
            min={new Date().toISOString().split('T')[0]}
            placeholder="Pick a date"
            className="flex-1"
          />
          <TimePicker
            value={time || '09:00'}
            onChange={setTime}
            disabled={!date}
            className="w-28"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit}
          disabled={!canSubmit}>
          <Icon icon={Plus} size="xs" />
          Create
        </Button>
      </div>
    </Surface>
  );
};

// ── Todo row ────────────────────────────────────────────────────

interface TodoRowProps {
  todo: GlobalTodo;
  onToggle: (meetingId: string, todoId: string) => void;
  onReminderSet: (meetingId: string, todoId: string, todoText: string, meetingTitle: string, dateTime: string | null) => void;
}

const TodoRow: React.FC<TodoRowProps> = ({ todo, onToggle, onReminderSet }) => {
  const overdue = !todo.completed && isOverdue(todo.dueDate);
  const reminderOverdue = todo.reminder ? isReminderOverdue(todo.reminder) : false;

  const handleReminderSet = useCallback((dateTime: string | null) => {
    onReminderSet(todo.meetingId, todo.id, todo.text, todo.meetingTitle, dateTime);
  }, [todo.meetingId, todo.id, todo.text, todo.meetingTitle, onReminderSet]);

  return (
    <div className="w-full flex items-start gap-2.5 px-4 py-2 group">
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
      {!todo.completed && (
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
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const { groups, filter, setFilter, searchQuery, setSearchQuery, toggleTodo, addTodo, setReminder, counts, isLoading } = useGlobalTodos();
  const [isCreating, setIsCreating] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const handleBack = useCallback(() => {
    setCurrentView('home');
    setSelectedHistoryId(null);
    setResult(null);
    setStatus(AppStatus.IDLE);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus]);

  const handleToggle = useCallback(async (meetingId: string, todoId: string) => {
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
      {/* Header */}
      <Surface as="header" edge="bottom" className="shrink-0 px-6 pt-2 pb-3">
        {/* Search + Create row — inline with stats */}
        <div className="flex items-center gap-3 mb-3">
          <IconButton icon={ArrowLeft} label="Back to home" size="sm" onClick={handleBack} />
          <div className="flex items-center gap-2">
            <Icon icon={ListTodo} size="md" tone="muted" />
            <Text as="h1" variant="pageTitle">
              To-Dos & Reminders
            </Text>
          </div>

          {/* Right side: stats, search, add */}
          <div className="flex items-center gap-2 ml-auto">
            {counts.total > 0 && !isSearchOpen && (
              <Text variant="helper" tone="faint">
                {counts.pending} pending · {counts.completed} done
              </Text>
            )}

            {/* Expandable search */}
            {isSearchOpen ? (
              <div className="flex items-center gap-1 w-52">
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
              </div>
            ) : (
              <IconButton icon={Search} label="Search to-dos" size="sm" onClick={handleSearchToggle} />
            )}

            <Button variant="primary" size="sm" className="shrink-0" onClick={() => setIsCreating(true)}
              disabled={isCreating}>
              <Icon icon={Plus} size="xs" />
              Add To-Do
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <Tabs items={filterTabs} value={filter} onValueChange={setFilter} />
      </Surface>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Create form */}
        {isCreating && (
          <div className="px-5 pt-4">
            <CreateTodoForm
              onSubmit={addTodo}
              onCancel={() => setIsCreating(false)}
            />
          </div>
        )}

        {isLoading ? (
          /* Loading skeleton */
          <div className="p-6 space-y-4">
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
              <div key={group.meetingId} className="mb-1">
                {/* Meeting header */}
                <Surface variant="page" edge="bottom" className="sticky top-0 z-10 px-5 py-1.5 flex items-center gap-2">
                  <Text as="h2" variant="label" tone="muted" truncate>
                    {group.meetingTitle}
                  </Text>
                  <Text variant="caption" tone="faint" className="shrink-0">
                    {formatDate(group.timestamp)}
                  </Text>
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
