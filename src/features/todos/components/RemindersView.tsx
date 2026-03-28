/**
 * RemindersView Component
 *
 * Full-screen view showing all todos/reminders across all meetings.
 * Navigated to via IdleView pill; uses same pattern as Settings view.
 * Grouped by meeting, filterable, searchable, with create support.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { ArrowLeft, ListTodo, Clock, AlertTriangle, Check, Bell, CalendarDays, Inbox, Search, Plus, X, ChevronDown } from 'lucide-react';
import { useApp } from '@shared/contexts/AppContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useGlobalTodos } from '../hooks/useGlobalTodos';
import type { TodoFilter, GlobalTodo } from '../hooks/useGlobalTodos';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { DatePicker, TimePicker } from '@shared/ui';
import { AppStatus } from '@/types';
import type { HistoryItem } from '@/types';
import { isOverdue, formatDueDate, formatReminderDate, isReminderOverdue, buildISOFromDateInput } from '@shared/utils/todo.utils';
import ReminderPicker from './ReminderPicker';
import * as PopoverPrimitive from '@radix-ui/react-popover';

// ── Filter chip config ──────────────────────────────────────────

const FILTERS: { key: TodoFilter; label: string; countKey: 'total' | 'pending' | 'completed' }[] = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'completed', label: 'Completed', countKey: 'completed' },
];

// ── Date formatting helpers ─────────────────────────────────────

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ── Meeting selector (Radix Popover) ────────────────────────────

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
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 text-left ${COMPONENT.settingsInput} truncate`}
        >
          <span className={`flex-1 truncate text-xs ${selected ? TEXT.primary : TEXT.faint}`}>
            {selected ? (selected.title || 'Untitled Meeting') : 'Select a meeting…'}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${TEXT.faint}`} />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={`w-[var(--radix-popover-trigger-width)] max-h-60 overflow-hidden rounded-lg border ${BORDER.default} ${SURFACE.card} shadow-lg z-50`}
        >
          {/* Search within selector */}
          <div className={`p-2 border-b ${BORDER.subtle}`}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings…"
              className={`w-full px-2 py-1.5 text-xs ${COMPONENT.inlineInput}`}
              autoFocus
            />
          </div>

          <div className="overflow-y-auto max-h-48 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className={`px-3 py-4 text-xs text-center ${TEXT.faint}`}>No meetings found</div>
            ) : (
              filtered.map(h => (
                <button
                  key={h.id}
                  onClick={() => { onSelect(h.id); setOpen(false); setQuery(''); }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors ${SURFACE.hoverSubtle} ${
                    h.id === selectedId ? TEXT.heading + ' font-medium' : TEXT.secondary
                  }`}
                >
                  <span className="block truncate">{h.title || 'Untitled Meeting'}</span>
                  <span className={`block text-[10px] ${TEXT.faint}`}>
                    {new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

// ── Create todo form ────────────────────────────────────────────

interface CreateTodoFormProps {
  onSubmit: (meetingId: string, text: string, dueDate?: string) => Promise<void>;
  onCancel: () => void;
}

const CreateTodoForm: React.FC<CreateTodoFormProps> = ({ onSubmit, onCancel }) => {
  const { items: historyItems } = useHistory();
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
    <div className={`rounded-xl border ${BORDER.default} ${SURFACE.subtle} p-4 space-y-3 animate-fade-in`}>
      {/* Todo text */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What do you need to do?"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        className={`w-full h-16 p-3 ${COMPONENT.inlineInput} resize-none`}
        autoFocus
      />

      {/* Meeting selector */}
      <div className="space-y-1.5">
        <label className={`text-xs font-medium ${TEXT.secondary} flex items-center gap-1.5`}>
          <ListTodo className="w-3.5 h-3.5" />
          Link to meeting
        </label>
        <MeetingSelector
          items={historyItems}
          selectedId={meetingId}
          onSelect={setMeetingId}
        />
      </div>

      {/* Deadline picker */}
      <div className="space-y-1.5">
        <label className={`text-xs font-medium ${TEXT.secondary} flex items-center gap-1.5`}>
          <CalendarDays className="w-3.5 h-3.5" />
          Due date (optional)
        </label>
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
            className="w-[110px]"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className={COMPONENT.settingsButtonOutline}>
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={COMPONENT.settingsButtonPrimary}
        >
          <Plus className="w-3.5 h-3.5" />
          Create
        </button>
      </div>
    </div>
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

  const handleReminderSet = useCallback((dateTime: string | null) => {
    onReminderSet(todo.meetingId, todo.id, todo.text, todo.meetingTitle, dateTime);
  }, [todo.meetingId, todo.id, todo.text, todo.meetingTitle, onReminderSet]);

  return (
    <div className={`w-full flex items-start gap-2.5 px-4 py-2 text-left transition-colors ${SURFACE.hoverSubtle} group`}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.meetingId, todo.id)}
        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
          todo.completed
            ? 'bg-green-500 border-green-500 text-white'
            : `${BORDER.selectedCard} group-hover:border-green-400`
        }`}
      >
        {todo.completed && <Check className="w-2.5 h-2.5" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-normal break-words ${
          todo.completed ? `line-through ${TEXT.faint}` : TEXT.primary
        }`}>
          {todo.text}
        </p>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
          {/* Due date */}
          {todo.dueDate && (
            <span className={`inline-flex items-center gap-1 text-xs ${
              overdue ? 'text-red-500' : TEXT.muted
            }`}>
              {overdue ? <AlertTriangle className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
              {overdue ? 'Overdue: ' : 'Due: '}{formatDueDate(todo.dueDate)}
            </span>
          )}

          {/* Reminder */}
          {todo.reminder && !todo.completed && (
            <span className={`inline-flex items-center gap-1 text-xs ${
              isReminderOverdue(todo.reminder) ? 'text-red-500' : 'text-amber-500'
            }`}>
              <Bell className="w-3 h-3" />
              {isReminderOverdue(todo.reminder) ? 'Overdue: ' : ''}{formatReminderDate(todo.reminder.dateTime)}
            </span>
          )}

          {/* Owner */}
          {todo.owner && (
            <span className={`text-xs ${TEXT.faint}`}>
              → {todo.owner}
            </span>
          )}
        </div>
      </div>

      {/* Reminder bell — always visible when active, hover when not */}
      {!todo.completed && (
        <div className={`shrink-0 ${todo.reminder ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
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
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useApp();
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Header */}
      <div className={`shrink-0 border-b ${BORDER.default} px-6 pt-2 pb-0`}>
        {/* Search + Create row — inline with stats */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleBack}
            className={`p-1.5 rounded-lg ${SURFACE.hoverSubtle} ${TEXT.muted} hover:${TEXT.primary} transition-colors`}
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <ListTodo className={`w-5 h-5 ${TEXT.muted}`} />
            <h1 className={`text-lg font-semibold ${TEXT.heading}`}>
              To-Dos & Reminders
            </h1>
          </div>

          {/* Right side: stats, search, add */}
          <div className="flex items-center gap-2 ml-auto">
            {counts.total > 0 && !isSearchOpen && (
              <span className={`text-xs ${TEXT.faint}`}>
                {counts.pending} pending · {counts.completed} done
              </span>
            )}

            {/* Expandable search */}
            {isSearchOpen ? (
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${BORDER.subtle} ${SURFACE.subtle} transition-all w-52`}>
                <Search className={`w-3.5 h-3.5 shrink-0 ${TEXT.faint}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search…"
                  className={`flex-1 bg-transparent text-xs ${TEXT.primary} placeholder:${TEXT.faint} outline-none min-w-0`}
                  onKeyDown={(e) => { if (e.key === 'Escape') handleSearchToggle(); }}
                />
                <button
                  onClick={handleSearchToggle}
                  className={`p-0.5 rounded ${SURFACE.hoverSubtle} ${TEXT.faint}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSearchToggle}
                className={`p-1.5 rounded-lg ${SURFACE.hoverSubtle} ${TEXT.muted} transition-colors`}
                aria-label="Search to-dos"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setIsCreating(true)}
              disabled={isCreating}
              className={`${COMPONENT.settingsButtonPrimary} shrink-0`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add To-Do
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1 -mb-px">
          {FILTERS.map(({ key, label, countKey }) => {
            const count = counts[countKey];
            const isActive = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? `${TEXT.heading} border-parchment-900 dark:border-night-100`
                    : `${TEXT.muted} border-transparent hover:${TEXT.secondary}`
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 ${isActive ? '' : 'opacity-60'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

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
                <div className={`h-4 w-40 rounded ${SURFACE.skeleton}`} />
                <div className={`h-10 w-full rounded-lg ${SURFACE.skeleton}`} />
                <div className={`h-10 w-full rounded-lg ${SURFACE.skeleton}`} />
              </div>
            ))}
          </div>
        ) : !hasContent ? (
          /* Empty state */
          <div className="min-h-full flex flex-col items-center justify-center px-6">
            <div className={`p-4 rounded-2xl ${SURFACE.subtle} mb-4`}>
              {searchQuery ? (
                <Search className={`w-8 h-8 ${TEXT.faint}`} />
              ) : (
                <Inbox className={`w-8 h-8 ${TEXT.faint}`} />
              )}
            </div>
            <p className={`text-sm font-medium ${TEXT.secondary} mb-1`}>
              {searchQuery
                ? 'No matching to-dos'
                : filter === 'all' ? 'No to-dos yet' : `No ${filter} to-dos`}
            </p>
            <p className={`text-xs ${TEXT.faint} text-center max-w-xs`}>
              {searchQuery
                ? 'Try different keywords or clear your search'
                : filter === 'all'
                  ? 'To-dos from your meetings will appear here'
                  : 'Try a different filter to see more items'}
            </p>
          </div>
        ) : groups.length > 0 ? (
          /* Grouped list */
          <div className="py-2">
            {groups.map((group) => (
              <div key={group.meetingId} className="mb-1">
                {/* Meeting header */}
                <div className={`sticky top-0 z-10 px-5 py-1.5 ${SURFACE.page} border-b ${BORDER.subtle}`}>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-xs font-semibold ${TEXT.secondary} truncate`}>
                      {group.meetingTitle}
                    </h2>
                    <span className={`text-[10px] ${TEXT.faint} shrink-0`}>
                      {formatDate(group.timestamp)}
                    </span>
                    <span className={`text-[10px] ${TEXT.faint} shrink-0 ml-auto`}>
                      {group.todos.filter(t => !t.completed).length}/{group.todos.length}
                    </span>
                  </div>
                </div>

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
