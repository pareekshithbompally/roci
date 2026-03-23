/**
 * get_action_items tool
 *
 * Retrieves action items / todos from meetings.
 * Can filter by meeting or across all meetings, and by completion status.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { meetingReferenceService } from '../../../services/meetingReferenceService';
import type { HistoryItem, ActionItem } from '@/types';

interface MeetingActions {
  title: string;
  date: string;
  items: ActionItem[];
}

export const getActionItemsTool: ToolDefinition = {
  name: 'get_action_items',
  description:
    'Get action items and todos from meetings. Can retrieve from a specific meeting or across all recent meetings. ' +
    'Optionally filter by completion status (pending, completed, or all).',
  parameters: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'string',
        description: 'If provided, get action items from this meeting only. If omitted, get from all recent meetings.',
      },
      status: {
        type: 'string',
        description: 'Filter by status.',
        enum: ['pending', 'completed', 'all'],
        default: 'all',
      },
    },
  },

  async execute(params, context): Promise<ToolResult> {
    const meetingId = params.meeting_id as string | undefined;
    const status = (params.status as string) ?? 'all';

    let items: HistoryItem[];
    if (meetingId) {
      const found = context.historyItems.find(item => item.id === meetingId);
      if (!found) {
        return {
          toolCallId: '',
          content: `Error: Meeting not found with ID: ${meetingId}`,
          isError: true,
        };
      }
      items = [found];
    } else {
      // Take recent meetings (max 20 to avoid excessive loading)
      items = [...context.historyItems]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    }

    let references;
    try {
      // Load action items via selective context
      references = await meetingReferenceService.loadSelectiveContext(items, ['actionItems']);
    } catch (error) {
      console.error('[GetActionItemsTool] Failed to load action items:', error);
      return {
        toolCallId: '',
        content: `Failed to load action items: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'get_action_items', executionMs: 0 },
      };
    }

    // Collect and format
    const meetings: MeetingActions[] = [];
    let totalPending = 0;
    let totalCompleted = 0;

    for (const ref of references) {
      if (!ref.todos || ref.todos.length === 0) continue;

      let filtered = ref.todos;
      if (status === 'pending') {
        filtered = ref.todos.filter(t => !t.completed);
      } else if (status === 'completed') {
        filtered = ref.todos.filter(t => t.completed);
      }

      if (filtered.length === 0) continue;

      totalPending += filtered.filter(t => !t.completed).length;
      totalCompleted += filtered.filter(t => t.completed).length;

      const date = new Date(ref.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      meetings.push({ title: ref.title, date, items: filtered });
    }

    if (meetings.length === 0) {
      const scope = meetingId ? 'this meeting' : 'recent meetings';
      return {
        toolCallId: '',
        content: `No action items found in ${scope}${status !== 'all' ? ` with status "${status}"` : ''}.`,
        isError: false,
        meta: { toolName: 'get_action_items', executionMs: 0, resultCount: 0 },
      };
    }

    const lines: string[] = [`Action Items (${totalPending} pending, ${totalCompleted} completed):\n`];

    for (const meeting of meetings) {
      lines.push(`From "${meeting.title}" (${meeting.date}):`);
      for (const item of meeting.items) {
        const check = item.completed ? '[x]' : '[ ]';
        const due = item.dueDate ? ` (Due: ${item.dueDate})` : '';
        lines.push(`- ${check} ${item.text}${due}`);
      }
      lines.push('');
    }

    const totalItems = totalPending + totalCompleted;
    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'get_action_items', executionMs: 0, resultCount: totalItems },
    };
  },
};
