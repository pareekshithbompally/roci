/** The one New to-do form, for the To-dos page and a meeting's tab: the shared form
 *  (a dialog on a Mac, a sheet on iPhone). Text, the meeting (when not already fixed) and an optional due date; time once a date is set. */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMeetingBrief, useMeetingsFound } from '@shared/hooks/useMeetings';
import {
  Button, CardRow, DatePicker, Icon, Input, Popover, PopoverContent, PopoverTrigger, Row, Section, Surface, Text, Textarea,
  TimePicker,
} from '@shared/ui';
import { buildISOFromDateInput, formatMeetingDate } from '@shared/utils/todo.utils';
import { FormDialog } from '@shared/components';
import { localDayKey } from '@shared/utils/localDate';
import { TODOS_CONFIG } from '@config/todos.config';

const FORM = TODOS_CONFIG.form;

interface MeetingSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Picks a meeting: while open it reads the store, the newest first, then those whose title has every word typed. */
const MeetingSelector: React.FC<MeetingSelectorProps> = ({ selectedId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMeetingBrief(selectedId || null);
  const words = query.trim().split(/\s+/).filter(Boolean);
  const filtered = useMeetingsFound(words.length > 0 ? { words } : {}, TODOS_CONFIG.meetingPicker, open);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
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

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={FORM.title}
      submit={{ label: FORM.submit, onPress: () => void submit(), disabled: !canSubmit, busy: saving }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={FORM.text}
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        className="h-16"
        autoFocus
      />
      <Section>
        {fixedMeetingId === undefined && (
          <CardRow title={FORM.meeting} stacked>
            <MeetingSelector selectedId={pickedMeetingId} onSelect={setPickedMeetingId} />
          </CardRow>
        )}
        <CardRow
          title={FORM.due}
          actions={
            <>
              <DatePicker value={date} onChange={setDate} min={localDayKey(new Date())} placeholder={FORM.dueDate} />
              {date && <TimePicker value={time || FORM.defaultTime} onChange={setTime} />}
            </>
          }
        />
      </Section>
    </FormDialog>
  );
};
