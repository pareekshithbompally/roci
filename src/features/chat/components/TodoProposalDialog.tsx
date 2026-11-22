/** Edit a proposed to-do before it is saved: its text, due date, reminder and owner. */

import React, { useState } from 'react';
import { FormDialog, SettingsInput } from '@shared/components';
import { todoProposalStore, type TodoProposal } from '@features/chat/stores/todoProposalStore';
import { TODOS_CONFIG } from '@config/todos.config';

const COPY = TODOS_CONFIG.proposal;

export const TodoProposalDialog: React.FC<{ proposal: TodoProposal; onClose: () => void }> = ({ proposal, onClose }) => {
  const [text, setText] = useState(proposal.text);
  const [dueDate, setDueDate] = useState(proposal.dueDate ?? '');
  const [reminder, setReminder] = useState(proposal.reminderDateTime ?? '');
  const [owner, setOwner] = useState(proposal.owner ?? '');

  const save = () => {
    todoProposalStore.edit(proposal.id, { text: text.trim(), dueDate: dueDate || null, reminderDateTime: reminder || null, owner: owner.trim() || null });
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={COPY.edit}
      size="md"
      submit={{ label: COPY.done, onPress: save, disabled: !text.trim() }}
    >
      <form id="todo-proposal" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <SettingsInput label={COPY.text} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <SettingsInput label={COPY.due} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <SettingsInput label={COPY.reminder} type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        <SettingsInput label={COPY.owner} value={owner} onChange={(e) => setOwner(e.target.value)} />
      </form>
    </FormDialog>
  );
};
