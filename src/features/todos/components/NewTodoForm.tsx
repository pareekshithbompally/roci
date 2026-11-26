/** The one New To-do form, laid out like a new reminder: the title, then Date and Time (each a switch; a date opens its
 *  picker), then the meeting it belongs to (None: a to-do of its own). A Mac shows it in the corner panel the + opened,
 *  with Cancel and Add; iPhone as a full-screen page with ✕ and ✓. Opened only through `startCreate('todo')`. */

import React, { useState } from 'react';
import { CalendarDays, ChevronDown, Clock, Users } from 'lucide-react';
import { useMeetingBrief, useMeetingsFound } from '@shared/hooks/useMeetings';
import {
  AddForm, Button, CardRow, DatePicker, Icon, IconTile, Input, Popover, PopoverContent, PopoverTrigger, Row, SearchField,
  Section, Surface, Switch, Text, TimePicker,
} from '@shared/ui';
import { buildISOFromDateInput, formatMeetingDate } from '@shared/utils/todo.utils';
import { localDayKey } from '@shared/utils/localDate';
import { useTodoActions } from '@features/todos/hooks/useTodoActions';
import { TODOS_CONFIG } from '@config/todos.config';
import { UNTITLED_MEETING } from '@config/meetingLive.config';

const FORM = TODOS_CONFIG.form;

/** Picks a meeting (or none): while open it reads the store, the newest first, then those whose title has every word typed. */
const MeetingPicker: React.FC<{ selectedId: string | null; onSelect: (id: string | null) => void }> = ({ selectedId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMeetingBrief(selectedId);
  const words = query.trim().split(/\s+/).filter(Boolean);
  const found = useMeetingsFound(words.length > 0 ? { words } : {}, TODOS_CONFIG.meetingPicker, open);
  const pick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Text tone={selected ? 'primary' : 'muted'} truncate>{selected ? (selected.title || UNTITLED_MEETING) : FORM.noMeeting}</Text>
          <Icon icon={ChevronDown} size="xs" tone="faint" className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" label={FORM.meeting} className="max-h-72 overflow-hidden">
        <Surface edge="bottom" className="p-2">
          <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={FORM.searchMeetings} />
        </Surface>
        <div className="max-h-56 overflow-y-auto p-1">
          <Row selected={selectedId === null} onClick={() => pick(null)}>
            <Text className="flex-1">{FORM.noMeeting}</Text>
          </Row>
          {found.map((m) => (
            <Row key={m.id} selected={m.id === selectedId} onClick={() => pick(m.id)}>
              <Text truncate className="flex-1">{m.title || UNTITLED_MEETING}</Text>
              <Text variant="caption" tone="faint" className="shrink-0">{formatMeetingDate(m.timestamp)}</Text>
            </Row>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface Draft {
  text: string;
  /** `YYYY-MM-DD`, or '' with Date off. */
  date: string;
  /** `HH:MM`, or '' with Time off. */
  time: string;
  meetingId: string | null;
}

/** The fields, the same on both platforms. */
const TodoFields: React.FC<{ draft: Draft; set: (next: Partial<Draft>) => void }> = ({ draft, set }) => {
  const today = localDayKey(new Date());
  return (
    <>
      <Section>
        <CardRow title={<Input variant="plain" value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder={FORM.text} aria-label={FORM.text} autoFocus />} />
      </Section>
      <Section>
        <CardRow
          leading={<IconTile icon={CalendarDays} />}
          title={FORM.date}
          actions={(
            <>
              {draft.date && <DatePicker value={draft.date} onChange={(date) => set({ date })} min={today} placeholder={FORM.date} />}
              <Switch checked={!!draft.date} onCheckedChange={(on) => set(on ? { date: today } : { date: '', time: '' })} aria-label={FORM.date} />
            </>
          )}
        />
        <CardRow
          leading={<IconTile icon={Clock} />}
          title={FORM.time}
          disabled={!draft.date}
          actions={(
            <>
              {draft.time && <TimePicker value={draft.time} onChange={(time) => set({ time })} />}
              <Switch checked={!!draft.time} onCheckedChange={(on) => set({ time: on ? FORM.defaultTime : '' })} aria-label={FORM.time} />
            </>
          )}
        />
      </Section>
      <Section>
        <CardRow leading={<IconTile icon={Users} />} title={FORM.meeting} actions={<MeetingPicker selectedId={draft.meetingId} onSelect={(meetingId) => set({ meetingId })} />} />
      </Section>
    </>
  );
};

interface NewTodoFormProps {
  open: boolean;
  /** The meeting it starts in (a meeting's +); null starts with none. */
  meetingId: string | null;
  onClose: () => void;
}

export const NewTodoForm: React.FC<NewTodoFormProps> = ({ open, meetingId, onClose }) => {
  const { add } = useTodoActions();
  const [draft, setDraft] = useState<Draft>({ text: '', date: '', time: '', meetingId });
  const [saving, setSaving] = useState(false);
  const set = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const canSave = draft.text.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await add(draft.meetingId, draft.text.trim(), draft.date ? buildISOFromDateInput(draft.date, draft.time || undefined) : undefined);
      onClose();
    } catch (error: unknown) {
      console.error('[NewTodoForm] Create failed:', error);
      setSaving(false);
    }
  };

  return (
    <AddForm open={open} title={FORM.title} onClose={onClose} onSave={() => void save()} saveLabel={FORM.submit} canSave={canSave} busy={saving}>
      <TodoFields draft={draft} set={set} />
    </AddForm>
  );
};
