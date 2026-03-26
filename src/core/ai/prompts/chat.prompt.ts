/**
 * Chat System Prompt
 *
 * Single source of truth for the Kasset chat system prompt.
 * Schema enforcement handles structure; this prompt describes content expectations.
 */

export interface ChatPromptOptions {
  contextBlock?: string;
  hasTools?: boolean;
  meetingCount?: number;
}

export function buildChatSystemPrompt(options: ChatPromptOptions = {}): string {
  const {
    contextBlock,
    meetingCount = 0,
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

  // ── Context ──
  const contextSection = contextBlock ? `\n\n${contextBlock}` : '';

  return basePrompt + contextSection;
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

export function buildIntentClassifierPrompt(): string {
  return `You classify user messages in a meeting intelligence app. Output ONLY valid JSON.

## Intents

1. **general** — No meeting/chat data needed. General knowledge, coding, math, greetings, creative writing, meta questions about the app.
2. **meeting_search** — Find WHICH meetings match a topic. User wants to locate meetings, not extract content.
3. **meeting_recall** — Remember WHAT was said/decided/discussed. Needs full meeting content.
4. **meeting_detail** — View raw transcript, notes, or summary from a specific meeting.
5. **meeting_list** — Browse/list meetings chronologically. No content search.
6. **action_items** — Todos, tasks, assignments, follow-ups.
7. **relationship** — WHO is connected to WHAT. Graph traversal (people, topics, projects, decisions).
8. **cross_meeting** — Aggregate/compare across multiple meetings.
9. **chat_recall** — Search/browse past AI conversation sessions (not meetings).
10. **catch_up** — Broad status update: recent meetings + pending action items.

## Decision Rules (in priority order)

1. No reference to user's data → general
2. About past AI chat sessions → chat_recall
3. Broad status update, no specific topic → catch_up
4. About action items/todos/tasks → action_items
5. About WHO/connections/relationships between entities → relationship
6. Wants to LIST/BROWSE meetings → meeting_list
7. Patterns/evolution ACROSS multiple meetings → cross_meeting
8. Asking WHICH meetings match a topic → meeting_search
9. Asking to VIEW raw transcript/notes/summary → meeting_detail
10. Default for remaining meeting queries → meeting_recall

## Conversation context

The user may refer to things from earlier in the conversation. "Tell me more" after discussing a meeting = continue that intent. "Show me the transcript" after finding a meeting = meeting_detail.

## Output Schema

{
  "intent": "<one of the 10 types>",
  "confidence": "high" | "medium",
  "search_query": "<refined search terms, or null>",
  "requested_fields": ["summary", "transcript", "notes", "actionItems"] | null,
  "action_item_filter": "pending" | "completed" | "all" | null,
  "graph_target": "<entity to search in graph, or null>",
  "graph_node_types": ["person", "topic", "decision", "project", "meeting"] | null,
  "graph_edge_types": ["attended", "discussed", "produced_decision", ...] | null,
  "temporal_hint": "<time reference like 'last week', or null>",
  "max_meetings": <number 1-10, or null>,
  "depth": "none" | "surface" | "deep"
}

## Examples

User: "Hi, how are you?"
{"intent":"general","confidence":"high","depth":"none"}

User: "What did we decide about the API redesign?"
{"intent":"meeting_recall","confidence":"high","search_query":"API redesign decision","requested_fields":["summary"],"depth":"deep","max_meetings":3}

User: "Show me meetings about security"
{"intent":"meeting_search","confidence":"high","search_query":"security","depth":"surface","max_meetings":5}

User: "What are my pending action items?"
{"intent":"action_items","confidence":"high","action_item_filter":"pending","depth":"surface"}

User: "Who was involved in the Q4 planning?"
{"intent":"relationship","confidence":"high","graph_target":"Q4 planning","graph_node_types":["meeting"],"graph_edge_types":["attended"],"depth":"surface"}

User: "Catch me up on what I missed"
{"intent":"catch_up","confidence":"high","depth":"deep","temporal_hint":null,"max_meetings":5}

User: "Show me the transcript of the board meeting"
{"intent":"meeting_detail","confidence":"high","search_query":"board meeting","requested_fields":["transcript"],"depth":"deep","max_meetings":1}

User: "Write a Python function to sort a list"
{"intent":"general","confidence":"high","depth":"none"}`;
}

export const CHAT_PROMPT = {
  buildSystem: buildChatSystemPrompt,
  buildRAGContext: buildRAGContextPrompt,
  buildIntentClassifier: buildIntentClassifierPrompt,
};
