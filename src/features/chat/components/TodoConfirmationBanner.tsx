/** Pending to-do proposals above the chat box, on the shared proposal card: confirm or cancel them all, edit or drop one. */

import React, { useState } from 'react';
import { ListTodo } from 'lucide-react';
import { ProposalCard, type ProposalItem } from '@shared/components';
import { formatShortDateTime, formatWeekdayDate } from '@shared/utils/formatters';
import { TODOS_CONFIG } from '@config/todos.config';
import { todoProposalStore, useTodoProposals, type TodoProposal } from '@features/chat/stores/todoProposalStore';
import { TodoProposalDialog } from './TodoProposalDialog';

const COPY = TODOS_CONFIG.proposal;

/** What a change does to an existing to-do; none for a new one. */
function verbOf(p: TodoProposal): string | undefined {
  if (p.action === 'create') return undefined;
  if (p.action === 'delete') return COPY.verbs.delete;
  if (p.done === true) return COPY.verbs.done;
  if (p.done === false) return COPY.verbs.reopen;
  return COPY.verbs.update;
}

/** A new to-do, or an edit of one, has fields to adjust; a delete or done / reopen has only its name. */
const editable = (p: TodoProposal) => p.action === 'create' || (p.action === 'update' && p.done === null);

/** Due · reminder · owner · meeting, as far as the proposal has them. */
function detailOf(p: TodoProposal): string {
  return [
    p.dueDate && `${COPY.dueShort} ${formatWeekdayDate(new Date(`${p.dueDate}T00:00:00`))}`,
    p.reminderDateTime && `${COPY.reminderShort} ${formatShortDateTime(p.reminderDateTime)}`,
    p.owner,
    p.meetingTitle ?? TODOS_CONFIG.general,
  ].filter(Boolean).join(' · ');
}

const STATE: Record<TodoProposal['status'], ProposalItem['state']> = {
  pending: 'pending', committing: 'saving', committed: 'saved', error: 'error',
};

const TodoConfirmationBanner: React.FC<{ chatId: string | undefined }> = ({ chatId }) => {
  const proposals = useTodoProposals(chatId ?? null);
  const [editing, setEditing] = useState<TodoProposal | null>(null);
  if (proposals.length === 0) return null;

  const pending = proposals.filter((p) => p.status === 'pending').length;
  const items: ProposalItem[] = proposals.map((p) => ({
    id: p.id,
    title: verbOf(p) ? p.originalText ?? p.text : p.text,
    verb: verbOf(p),
    detail: editable(p) ? detailOf(p) : undefined,
    state: STATE[p.status],
    error: p.error,
    onEdit: editable(p) ? () => setEditing(p) : undefined,
    onRemove: proposals.length > 1 ? () => todoProposalStore.remove(p.id) : undefined,
  }));
  const saved = proposals.every((p) => p.status === 'committed');

  return (
    <div className="pb-1.5">
      <ProposalCard
        icon={ListTodo}
        heading={saved ? COPY.saved(proposals.length) : COPY.toConfirm(pending)}
        items={items}
        confirmLabel={pending > 1 ? COPY.confirmAll(pending) : COPY.confirm}
        cancelLabel={COPY.cancel}
        onConfirm={() => void todoProposalStore.commitAll(chatId ?? null)}
        onCancel={() => todoProposalStore.cancelAll(chatId ?? null)}
      />
      {editing && <TodoProposalDialog proposal={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default TodoConfirmationBanner;
