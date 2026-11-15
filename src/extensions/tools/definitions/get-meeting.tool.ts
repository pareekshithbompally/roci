/** get_meeting: loads chosen fields of a meeting by ID, formatted for the LLM. */

import type { ToolDefinition, ToolResult, MeetingCitation } from '@extensions/tools/types';
import { meetingReferenceService } from '@services/meetingReferenceService';
import type { MeetingField } from '@services/meetingReferenceService';
import { errorMessage } from '@shared/utils/errors';

const VALID_FIELDS: MeetingField[] = ['summary', 'transcript', 'notes', 'actionItems'];

export const getMeetingTool: ToolDefinition = {
  name: 'get_meeting',
  description:
    'Load specific fields of a meeting by its ID. Use after search_meetings to get full details. ' +
    'Request only the fields you need to minimize response size.',
  parameters: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'string',
        description: 'The meeting ID (obtained from search_meetings or list_meetings).',
      },
      fields: {
        type: 'array',
        description: 'Which fields to load. Available: "summary", "transcript", "notes", "actionItems".',
        items: {
          type: 'string',
          enum: ['summary', 'transcript', 'notes', 'actionItems'],
        },
        minItems: 1,
      },
    },
    required: ['meeting_id', 'fields'],
  },

  async execute(params, context): Promise<ToolResult> {
    const meetingId = params.meeting_id as string;
    const fields = params.fields as string[];

    // Validate fields
    const invalidFields = fields.filter(f => !VALID_FIELDS.includes(f as MeetingField));
    if (invalidFields.length > 0) {
      return {
        toolCallId: '',
        content: `Error: Invalid field(s): ${invalidFields.join(', ')}. Valid fields: ${VALID_FIELDS.join(', ')}`,
        isError: true,
      };
    }

    // Find the meeting
    const historyItem = context.historyItems.find(item => item.id === meetingId);
    if (!historyItem) {
      return {
        toolCallId: '',
        content: `Error: Meeting not found with ID: ${meetingId}`,
        isError: true,
      };
    }

    let formatted: string;
    try {
      const references = await meetingReferenceService.loadSelectiveContext(
        [historyItem],
        fields as MeetingField[],
      );
      formatted = meetingReferenceService.formatForLLM(references);
    } catch (error) {
      console.error('[GetMeetingTool] Failed to load meeting:', error);
      return {
        toolCallId: '',
        content: `Failed to load meeting data: ${errorMessage(error)}`,
        isError: true,
        meta: { toolName: 'get_meeting', executionMs: 0 },
      };
    }

    if (!formatted) {
      return {
        toolCallId: '',
        content: `Meeting "${historyItem.title}" found but requested fields are empty.`,
        isError: false,
      };
    }

    // Build citation so the meeting appears in Sources UI
    const citation: MeetingCitation = {
      meetingId: historyItem.id,
      meetingTitle: historyItem.title,
      meetingTimestamp: historyItem.timestamp,
      excerpt: formatted.slice(0, 300),
      score: 1, // Explicit retrieval — always highest relevance
    };

    return {
      toolCallId: '',
      content: formatted,
      isError: false,
      meta: { toolName: 'get_meeting', executionMs: 0, resultCount: 1, citations: [citation] },
    };
  },
};
