/**
 * list_meetings tool
 *
 * Simple listing of recent meetings for browsing.
 * No RAG dependency — just reads from context.historyItems.
 */

import type { ToolDefinition, ToolResult } from '../types';

export const listMeetingsTool: ToolDefinition = {
  name: 'list_meetings',
  description:
    'List recent meetings with their titles, dates, and IDs. ' +
    'Use this when the user wants to browse their meetings or when you need to find a meeting by date.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        description: 'How many recent meetings to return.',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
    },
  },

  async execute(params, context): Promise<ToolResult> {
    const count = (params.count as number) ?? 10;
    const total = context.historyItems.length;

    if (total === 0) {
      return {
        toolCallId: '',
        content: 'No meetings found. The user hasn\'t recorded any meetings yet.',
        isError: false,
        meta: { toolName: 'list_meetings', executionMs: 0, resultCount: 0 },
      };
    }

    const sorted = [...context.historyItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);

    const lines: string[] = [`Recent meetings (showing ${sorted.length} of ${total}):\n`];

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const date = new Date(item.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      lines.push(`${i + 1}. "${item.title}" — ${date} — ID: ${item.id}`);
    }

    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'list_meetings', executionMs: 0, resultCount: sorted.length },
    };
  },
};
