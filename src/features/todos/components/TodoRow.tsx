/** The one to-do row, in every to-do list (To-dos and a meeting's tab), like a reminder in Reminders: the checkbox, the to-do,
 *  and one quiet line under it (when it is due, in red once overdue; its reminder; the meeting it came from); its reminder
 *  bell and ⋯ (Edit, Delete) at the end. Every change goes through `useTodoActions`. */

import React, { useState } from 'react';
import { BellRing, Ellipsis } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ActionItem } from '@shared/types';
import { Checkbox, Icon, IconButton, Input, ItemRow, Text } from '@shared/ui';
import { Menu, type MenuEntry } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { queryKeys } from '@shared/query/queryKeys';
import { dueLabel, dueState, formatReminderDate } from '@shared/utils/todo.utils';
import { platform } from '@platform/index';
import { useTodoActions } from '@features/todos/hooks/useTodoActions';
import ReminderPicker from './ReminderPicker';
import { TODOS_CONFIG } from '@config/todos.config';
import { MENU_SYMBOLS } from '@config/ui.config';

const COPY = TODOS_CONFIG.row;

interface TodoRowProps {
  todo: ActionItem;
  meetingId: string | null;
  /** Shown in its line (the To-dos list); left out inside its own meeting. */
  meetingTitle?: string | null;
}

const report = (what: string) => (error: unknown) => console.error(`[TodoRow] ${what} failed:`, error);

/** The line under the title, dot-separated: due (red once overdue), the reminder, where it came from, who owns it; null with
 *  none of them. */
function detailLine(todo: ActionItem, meetingTitle?: string | null): React.ReactNode {
  const overdue = !todo.completed && dueState(todo.dueDate) === 'overdue';
  const parts: React.ReactNode[] = [
    todo.dueDate && (
      <Text key="due" variant="helper" tone={overdue ? 'danger' : 'muted'}>
        {overdue ? `${COPY.overdue} · ${dueLabel(todo.dueDate)}` : dueLabel(todo.dueDate)}
      </Text>
    ),
    todo.reminder && !todo.completed && (
      <Text key="reminder" variant="helper" tone="muted" className="inline-flex items-center gap-1">
        <Icon icon={BellRing} size="xs" />{formatReminderDate(todo.reminder.dateTime)}
      </Text>
    ),
    meetingTitle && <Text key="meeting" variant="helper" tone="muted" truncate>{meetingTitle}</Text>,
    todo.owner && <Text key="owner" variant="helper" tone="muted">{todo.owner}</Text>,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<Text key={`dot-${i}`} variant="helper" tone="faint">·</Text>, part]));
}

export const TodoRow: React.FC<TodoRowProps> = ({ todo, meetingId, meetingTitle }) => {
  const actions = useTodoActions();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.text);

  const save = () => {
    setEditing(false);
    if (text.trim() && text.trim() !== todo.text) actions.edit(todo.id, { text: text.trim() }).catch(report('Edit'));
  };
  const remove = async () => {
    if (await confirmDelete('to-do')) await actions.remove(todo.id);
  };
  const items: MenuEntry[] = [
    ...(!todo.completed ? [{ type: 'item' as const, label: COPY.edit, symbol: MENU_SYMBOLS.edit, onSelect: () => { setText(todo.text); setEditing(true); } }] : []),
    { type: 'item', label: COPY.delete, symbol: MENU_SYMBOLS.delete, destructive: true, onSelect: () => void remove().catch(report('Delete')) },
  ];

  const title = editing ? (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setEditing(false);
      }}
      size="sm"
      autoFocus
      aria-label={COPY.edit}
    />
  ) : todo.text;

  return (
    <ItemRow
      leading={<Checkbox checked={todo.completed} onCheckedChange={() => actions.setDone(todo.id, !todo.completed).catch(report('Done'))} />}
      title={title}
      done={todo.completed}
      detail={detailLine(todo, meetingTitle)}
      trailing={(
        <>
          {platform.hasNotifications && !todo.completed && (
            <ReminderPicker
              todoId={todo.id}
              meetingId={meetingId}
              todoText={todo.text}
              meetingTitle={meetingTitle ?? null}
              reminderDateTime={todo.reminder?.dateTime}
              dueDate={todo.dueDate}
              onReminderSet={() => void client.invalidateQueries({ queryKey: queryKeys.storeTodosAll() })}
            />
          )}
          <Menu label={COPY.more} trigger={<IconButton icon={Ellipsis} label={COPY.more} size="sm" />} items={items} />
        </>
      )}
    />
  );
};
