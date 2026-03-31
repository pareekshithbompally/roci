/**
 * Chat System Prompt
 *
 * Single source of truth for the Kasset chat system prompt.
 * Schema enforcement handles structure; this prompt describes content expectations.
 */

export interface ChatPromptOptions {
  contextBlock?: string;
  /** Whether the model has access to meeting tools (agentic loop). */
  hasToolAccess?: boolean;
  meetingCount?: number;
  /** Formatted temporal context string from formatTemporalContext(). */
  temporalContext?: string;
}

export function buildChatSystemPrompt(options: ChatPromptOptions = {}): string {
  const {
    contextBlock,
    hasToolAccess = false,
    meetingCount = 0,
    temporalContext,
  } = options;

  // ── Base identity ──
  const meetingContext =
    meetingCount > 0
      ? `The user has ${meetingCount} recorded meeting(s) stored in the app.`
      : '';

  const basePrompt = meetingCount > 0
    ? `You are Kasset, the AI assistant powering a meeting recording and analysis app called Kasset.ai. ${meetingContext}

Your name is Kasset. Always refer to yourself as Kasset when asked. You help users get insights from their recorded meetings and answer general questions.

## Meeting Context

When retrieved meeting context is provided in the conversation, use it to answer the user's question. Always cite which meeting your information comes from. If the context doesn't contain the answer, say so — do not make up meeting content.`
    : `You are Kasset, the AI assistant powering an app called Kasset.ai. Your name is Kasset. Always refer to yourself as Kasset when asked. You help users with everyday questions and tasks.`;

  // ── Tool usage guidance ──
  const toolSection = hasToolAccess && meetingCount > 0
    ? `

## Tools

You have access to meeting tools. Use them when the user asks about their meetings, action items, or past conversations. Do not call tools for general knowledge questions — just answer directly.

- Use search_meetings to find meetings by topic, then get_meeting to load full details if the user needs specifics.
- Use get_action_items to check todos and action items. Use manage_todo to create, update, complete, or delete todos.
- To create a todo linked to a specific meeting, first call search_meetings to find the meeting_id, then call manage_todo with that meeting_id.
- For general (non-meeting) todos, use meeting_id "_general" and meeting_title "General".
- manage_todo builds a proposal — the user must confirm via the UI card before anything is saved. Acknowledge what was proposed, but do NOT say you created or saved it.
- For broad catch-up requests, combine list_meetings and get_action_items.
- Use query_graph for relationship questions about who is connected to what across meetings.
- Use search_chats and get_chat to find past AI conversation sessions.`
    : '';

  // ── Temporal awareness ──
  const temporalSection = temporalContext ? `\n\n${temporalContext}` : '';

  // ── Context ──
  const contextSection = contextBlock ? `\n\n${contextBlock}` : '';

  return basePrompt + toolSection + temporalSection + contextSection;
}

export function buildRAGContextPrompt(
  meetings: Array<{ title: string; summary: string; transcript?: string }>
): string {
  if (meetings.length === 0) return '';

  return meetings
    .slice(0, 10)
    .map((item) => `Title: ${item.title}\nSummary: ${item.summary}\n---`)
    .join('\n');
}

export const CHAT_PROMPT = {
  buildSystem: buildChatSystemPrompt,
  buildRAGContext: buildRAGContextPrompt,
};
