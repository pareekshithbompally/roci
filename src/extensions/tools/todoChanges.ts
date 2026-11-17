/** A to-do change from a tool: in chat the user confirms it on a card first; an MCP agent, which asked the user
 *  already, has it saved at once. Either way it is written by the one commit path the card uses. */

import { commitTodoProposal, todoProposalStore } from '@features/chat';
import type { TodoProposal } from '@features/chat';
import { isPast, localDateTimeOf, ok, fail } from './contract';
import type { ToolContext, ToolResult } from './types';

export type TodoChange = Omit<TodoProposal, 'id' | 'status'>;

export async function submitTodoChange(change: TodoChange, context: ToolContext, summary: string): Promise<ToolResult> {
  const proposal: TodoProposal = { ...change, id: crypto.randomUUID(), status: 'pending' };
  if (context.approval === 'chat') {
    todoProposalStore.propose(proposal);
    return ok(`Proposed: ${summary}.\nThe user confirms it on the card below the chat; it is not saved until they do.`);
  }
  await commitTodoProposal(proposal);
  return ok(`Done: ${summary}.`);
}

/** A reminder must be ahead of now; the error says what now is, so the model can fix the date. */
export function pastReminder(reminderAt: string): ToolResult | null {
  if (!isPast(reminderAt)) return null;
  return fail(`reminder_at ${reminderAt} has already passed; it is now ${localDateTimeOf(Date.now())}. Give a later time.`);
}

/** ` — due 2026-11-20, reminder 2026-11-19T09:00, owner Sam, in "Standup"` for the proposal's one-line summary. */
export function changeDetails(change: TodoChange): string {
  const details = [
    change.dueDate && `due ${change.dueDate}`,
    change.reminderDateTime && `reminder ${change.reminderDateTime}`,
    change.owner && `owner ${change.owner}`,
    change.meetingTitle ? `in "${change.meetingTitle}"` : 'not tied to a meeting',
  ].filter(Boolean);
  return ` — ${details.join(', ')}`;
}
