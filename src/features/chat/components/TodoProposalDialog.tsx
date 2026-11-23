/** Edit a proposed to-do before it is saved: its text, due date, reminder and owner, as rows like New To-do. */

import React, { useState } from 'react';
import { CardRow, DatePicker, Section, TimePicker } from '@shared/ui';
import { FieldRow, FormDialog } from '@shared/components';
import { todoProposalStore, type TodoProposal } from '@features/chat/stores/todoProposalStore';
import { TODOS_CONFIG } from '@config/todos.config';
import { localDateFromParts, parseDateLoose } from '@shared/utils/todo.utils';
import { localDayKey, localTimeKey } from '@shared/utils/localDate';

const COPY = TODOS_CONFIG.proposal;
const { defaultTime } = TODOS_CONFIG.form;

/** A date the pickers can show: its day, and its time when it has one. */
interface When {
  day: string;
  time: string;
}

function whenOf(value: string | null | undefined): When {
  const date = value ? parseDateLoose(value) : null;
  if (!date) return { day: '', time: '' };
  return { day: localDayKey(date), time: value?.includes('T') ? localTimeKey(date) : '' };
}

/** A due date stays a plain day unless a time was set; a reminder is always a moment. */
function dueOf({ day, time }: When): string | null {
  if (!day) return null;
  return time ? localDateFromParts(day, time)?.toISOString() ?? day : day;
}

function reminderOf({ day, time }: When): string | null {
  return day ? localDateFromParts(day, time || defaultTime)?.toISOString() ?? null : null;
}

/** A date and, once a day is chosen, its time. */
const WhenRow: React.FC<{ title: string; when: When; onChange: (when: When) => void }> = ({ title, when, onChange }) => (
  <CardRow
    title={title}
    actions={
      <>
        <DatePicker value={when.day} onChange={(day) => onChange({ day, time: day ? when.time : '' })} min={localDayKey(new Date())} placeholder={title} />
        {when.day && <TimePicker value={when.time || defaultTime} onChange={(time) => onChange({ ...when, time })} />}
      </>
    }
  />
);

export const TodoProposalDialog: React.FC<{ proposal: TodoProposal; onClose: () => void }> = ({ proposal, onClose }) => {
  const [text, setText] = useState(proposal.text);
  const [due, setDue] = useState(() => whenOf(proposal.dueDate));
  const [reminder, setReminder] = useState(() => whenOf(proposal.reminderDateTime));
  const [owner, setOwner] = useState(proposal.owner ?? '');
  const dirty = text !== proposal.text || owner !== (proposal.owner ?? '') || dueOf(due) !== (proposal.dueDate ?? null) || reminderOf(reminder) !== (proposal.reminderDateTime ?? null);

  const save = () => {
    todoProposalStore.edit(proposal.id, { text: text.trim(), dueDate: dueOf(due), reminderDateTime: reminderOf(reminder), owner: owner.trim() || null });
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={COPY.edit}
      size="md"
      dirty={dirty}
      submit={{ label: COPY.done, onPress: save, disabled: !text.trim() }}
    >
      <form className="flex flex-col gap-section" onSubmit={(e) => { e.preventDefault(); if (text.trim()) save(); }}>
        <Section>
          <FieldRow typed autoFocus lines={2} title={COPY.text} value={text} onChange={setText} />
        </Section>
        <Section title={COPY.details}>
          <WhenRow title={COPY.due} when={due} onChange={setDue} />
          <WhenRow title={COPY.reminder} when={reminder} onChange={setReminder} />
          <FieldRow typed title={COPY.owner} value={owner} onChange={setOwner} />
        </Section>
      </form>
    </FormDialog>
  );
};
