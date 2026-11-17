/** The one New to-do form, for the To-dos page and a meeting's tab: a bottom sheet on iPhone (Cancel · New to-do · Add),
 *  an inline card on Mac. Text, the meeting (when not already fixed) and an optional due date; time once a date is set. */

import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ListTodo, Plus } from 'lucide-react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import {
  BottomSheet, Button, DatePicker, Icon, Input, Popover, PopoverContent, PopoverTrigger, Row, Surface, Text, Textarea,
  TimePicker,
} from '@shared/ui';
import type { HistoryItem } from '@shared/types';
import { buildISOFromDateInput, formatMeetingDate } from '@shared/utils/todo.utils';
import { useFormFactor } from '@platform/formFactor';
import { TODOS_CONFIG } from '@config/todos.config';




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
                <Text variant="caption" tone="faint" className="shrink-0">{formatMeetingDate(h.timestamp)}</Text>
              </Row>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface NewTodoFormProps {
  open: boolean;
  onClose: () => void;
  /** Saves it; `meetingId` is the fixed one when given, else the one picked. */
  onSubmit: (meetingId: string, text: string, dueDate?: string) => Promise<void>;
  /** The meeting it belongs to (a meeting's tab); omitted, the form asks (To-dos page). */
  meetingId?: string;
}

export const NewTodoForm: React.FC<NewTodoFormProps> = ({ open, onClose, onSubmit, meetingId: fixedMeetingId }) => {
  const phone = useFormFactor() === 'phone';
  const { items: historyItems } = useHistoryData();
  const [text, setText] = useState('');
  const [pickedMeetingId, setPickedMeetingId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const meetingId = fixedMeetingId ?? pickedMeetingId;
  const canSubmit = text.trim().length > 0 && meetingId.length > 0 && !saving;

  const close = () => {
    setText('');
    setPickedMeetingId('');
    setDate('');
    setTime('');
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit(meetingId, text.trim(), date ? buildISOFromDateInput(date, time || undefined) : undefined);
      close();
    } catch (error: unknown) {
      console.error('[NewTodoForm] Create failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const fields = (
    <div className="space-y-3">
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
      {fixedMeetingId === undefined && (
        <div className="space-y-1.5">
          <Text as="label" variant="label" tone="muted" className="flex items-center gap-1.5">
            <Icon icon={ListTodo} size="xs" />
            Meeting
          </Text>
          <MeetingSelector items={historyItems} selectedId={pickedMeetingId} onSelect={setPickedMeetingId} />
        </div>
      )}
      <div className="flex min-h-10 items-center gap-2">
        <Icon icon={CalendarDays} size="xs" tone="muted" />
        <Text as="label" variant="label" tone="muted" className="flex-1">Due</Text>
        <DatePicker value={date} onChange={setDate} min={new Date().toISOString().split('T')[0]} placeholder="Due date" />
        {date && <TimePicker value={time || '09:00'} onChange={setTime} />}
      </div>
    </div>
  );

  if (phone) {
    return (
      <BottomSheet open={open} onOpenChange={(next) => !next && close()} title={TODOS_CONFIG.add}>
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
          <Text as="h2" variant="bodyStrong">New to-do</Text>
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!canSubmit}>Add</Button>
        </div>
        <div className="px-4 pb-6">{fields}</div>
      </BottomSheet>
    );
  }

  if (!open) return null;
  return (
    <Surface variant="subtle" radius="xl" edge="all" className="p-4 space-y-3 animate-fade-in">
      {fields}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!canSubmit}>
          <Icon icon={Plus} size="xs" />
          Create
        </Button>
      </div>
    </Surface>
  );
};
