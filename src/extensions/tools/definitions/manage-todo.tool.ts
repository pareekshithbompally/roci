/** manage_todo: builds a create/toggle/update/delete TodoProposal; the write happens only after approval. */

import type { ToolContext, ToolDefinition, ToolResult } from '@extensions/tools/types';
import { store } from '@services/db';
import {
  todoProposalStore,
  commitTodoProposal,
  GENERAL_MEETING_ID,
  GENERAL_MEETING_TITLE,
} from '@features/chat';
import type { TodoProposal } from '@features/chat';
import type { TodoEntry } from '@shared/types';

export const manageTodoTool: ToolDefinition = {
  name: 'manage_todo',
  description:
    'Create, complete, update, or delete a todo/task/reminder. ' +
    'In Roci\'s chat the user confirms a proposal before anything is saved; ' +
    'called from another app, the change is saved at once.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The mutation to perform.',
        enum: ['create', 'toggle', 'update', 'delete'],
      },
      text: {
        type: 'string',
        description: 'Todo text (required for create, optional for update).',
      },
      meeting_id: {
        type: 'string',
        description: 'Target meeting ID. Use "_general" for non-meeting todos.',
      },
      meeting_title: {
        type: 'string',
        description: 'Display name of the target meeting.',
      },
      due_date: {
        type: 'string',
        description: 'ISO 8601 date (e.g. 2026-04-15).',
      },
      reminder_datetime: {
        type: 'string',
        description: 'ISO 8601 datetime for OS notification (e.g. 2026-04-15T09:00:00).',
      },
      owner: {
        type: 'string',
        description: 'Person(s) assigned to this todo.',
      },
      match_text: {
        type: 'string',
        description: 'For toggle/update/delete: text to fuzzy-match against existing todos.',
      },
    },
    required: ['action', 'meeting_id'],
  },
  writes: true,

  async execute(params, context): Promise<ToolResult> {
    const action = params.action as TodoProposal['action'];
    const meetingId = params.meeting_id as string;
    const meetingTitle = (params.meeting_title as string) || (meetingId === GENERAL_MEETING_ID ? GENERAL_MEETING_TITLE : 'Unknown Meeting');
    const text = params.text as string | undefined;
    const dueDate = params.due_date as string | undefined;
    const reminderDatetime = params.reminder_datetime as string | undefined;
    const owner = params.owner as string | undefined;
    const matchText = params.match_text as string | undefined;
    const isGeneral = meetingId === GENERAL_MEETING_ID;

    if (action === 'create') {
      if (!text) {
        return {
          toolCallId: '',
          content: 'Error: todo text is required for create action.',
          isError: true,
          meta: { toolName: 'manage_todo', executionMs: 0 },
        };
      }

      const proposal: TodoProposal = {
        id: crypto.randomUUID(),
        action: 'create',
        text,
        dueDate: dueDate || null,
        reminderDateTime: reminderDatetime || null,
        owner: owner || null,
        meetingId,
        meetingTitle,
        isGeneral,
        matchedTodoId: null,
        matchedTodoText: null,
        status: 'pending',
      };

      const parts = [`Create todo "${text}"`];
      if (dueDate) parts.push(`due ${dueDate}`);
      if (reminderDatetime) parts.push(`reminder at ${reminderDatetime}`);
      if (owner) parts.push(`assigned to ${owner}`);
      parts.push(isGeneral ? '(general)' : `in "${meetingTitle}"`);

      return submit(proposal, context, parts.join(' — '));
    }

    // For toggle/update/delete — need to find the existing todo
    if (!matchText) {
      return {
        toolCallId: '',
        content: 'Error: match_text is required to identify which todo to modify.',
        isError: true,
        meta: { toolName: 'manage_todo', executionMs: 0 },
      };
    }

    const todos = await store.todos.listForMeeting(meetingId);
    if (!todos || todos.length === 0) {
      return {
        toolCallId: '',
        content: `No todos found in meeting "${meetingTitle}".`,
        isError: true,
        meta: { toolName: 'manage_todo', executionMs: 0 },
      };
    }

    const matched = fuzzyMatchTodo(todos, matchText);
    if (!matched) {
      return {
        toolCallId: '',
        content: `No todo matching "${matchText}" found in "${meetingTitle}". Available todos:\n${todos.map(t => `- ${t.text}`).join('\n')}`,
        isError: true,
        meta: { toolName: 'manage_todo', executionMs: 0 },
      };
    }

    const proposal: TodoProposal = {
      id: crypto.randomUUID(),
      action,
      text: action === 'update' && text ? text : matched.text,
      dueDate: dueDate || matched.dueDate || null,
      reminderDateTime: reminderDatetime || matched.reminder?.dateTime || null,
      owner: owner || matched.owner || null,
      meetingId,
      meetingTitle,
      isGeneral,
      matchedTodoId: matched.id,
      matchedTodoText: matched.text,
      status: 'pending',
    };

    const actionLabel = action === 'toggle'
      ? (matched.completed ? 'Mark as pending' : 'Mark as done')
      : action === 'delete' ? 'Delete' : 'Update';

    return submit(proposal, context, `${actionLabel} todo "${matched.text}" in "${meetingTitle}"`);
  },
};

/** Chat queues the proposal for approval; a caller that already asked the user (MCP agent) saves at once. */
async function submit(proposal: TodoProposal, context: ToolContext, summary: string): Promise<ToolResult> {
  if (context.approval === 'chat') {
    todoProposalStore.propose(proposal);
    return todoResult(`Proposed: ${summary}.\nAwaiting user confirmation.`);
  }
  await commitTodoProposal(proposal);
  return todoResult(`Done: ${summary}.`);
}

function todoResult(content: string): ToolResult {
  return { toolCallId: '', content, isError: false, meta: { toolName: 'manage_todo', executionMs: 0 } };
}

/** Fuzzy-matches a todo by text: exact substring > word overlap > partial word. */
function fuzzyMatchTodo(todos: TodoEntry[], query: string): TodoEntry | null {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  let bestScore = 0;
  let bestMatch: TodoEntry | null = null;

  for (const todo of todos) {
    const todoLower = todo.text.toLowerCase();
    let score = 0;

    // Exact substring match (strongest signal)
    if (todoLower.includes(queryLower)) {
      score += 100;
    }

    // Word overlap
    const todoWords = todoLower.split(/\s+/);
    for (const qw of queryWords) {
      if (todoWords.some(tw => tw === qw)) {
        score += 20;
      } else if (todoWords.some(tw => tw.includes(qw) || qw.includes(tw))) {
        score += 10;
      }
    }

    // Penalize completed todos slightly for toggle (prefer pending ones)
    if (todo.completed) {
      score -= 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = todo;
    }
  }

  // Require at least some match quality
  return bestScore >= 10 ? bestMatch : null;
}
