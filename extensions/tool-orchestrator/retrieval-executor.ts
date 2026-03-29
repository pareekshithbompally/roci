/**
 * Retrieval Executor (Step 2)
 *
 * Takes IntentClassification from Step 1 and programmatically
 * fetches the data needed for synthesis. No LLM involved.
 *
 * Uses ragSearcher/chatSearcher/graphDB directly for structured results,
 * and toolExecutor for formatted deep-loading (get_meeting, get_action_items, etc.).
 */

import { toolExecutor } from '@extensions/tools';
import { ragSearcher } from '@extensions/rag';
import { chatSearcher } from '@extensions/rag';
import { graphDB } from '@extensions/rag';
import type { ToolCall, ToolResult, MeetingCitation } from '@extensions/tools/types';
import type {
  IntentClassification,
  RetrievalResult,
  OrchestratorCallbacks,
} from './types';
import type { HistoryItem } from '@/types';

// ── Tool Activity Labels ──

const TOOL_LABELS: Record<string, string> = {
  search_meetings: 'Searching meetings…',
  get_meeting: 'Loading meeting…',
  list_meetings: 'Listing meetings…',
  get_action_items: 'Getting action items…',
  manage_todo: 'Managing todo…',
  query_graph: 'Querying knowledge graph…',
  search_chats: 'Searching chats…',
  get_chat: 'Loading chat…',
  list_chats: 'Listing chats…',
};

// ── Execution Context ──

interface ExecutionContext {
  intent: IntentClassification;
  contextParts: string[];
  citations: MeetingCitation[];
  toolsUsed: string[];
  historyItems: HistoryItem[];
  signal?: AbortSignal;
  onToolActivity: OrchestratorCallbacks['onToolActivity'];
  mentionedMeetingIds?: string[];
}

let callCounter = 0;

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `retrieval-${name}-${++callCounter}`,
    name,
    arguments: args,
  };
}

/**
 * Execute a tool through the executor with UI activity callbacks.
 */
async function executeTool(
  ctx: ExecutionContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const call = makeToolCall(toolName, args);

  ctx.onToolActivity({
    toolName,
    label: TOOL_LABELS[toolName] ?? `Running ${toolName}…`,
    status: 'calling',
    toolCall: call,
  });

  const result = await toolExecutor.execute(call, {
    historyItems: ctx.historyItems,
    signal: ctx.signal,
  });

  ctx.onToolActivity({
    toolName,
    label: TOOL_LABELS[toolName] ?? `Running ${toolName}…`,
    status: 'done',
    toolCall: call,
    result,
  });

  ctx.toolsUsed.push(toolName);

  if (!result.isError) {
    ctx.contextParts.push(result.content);
  }

  // Collect citations from tool meta
  if (result.meta?.citations) {
    ctx.citations.push(...result.meta.citations);
  }

  return result;
}

// ── Main Entry Point ──

export async function executeRetrieval(params: {
  intent: IntentClassification;
  historyItems: HistoryItem[];
  signal?: AbortSignal;
  onToolActivity: OrchestratorCallbacks['onToolActivity'];
  mentionedMeetingIds?: string[];
}): Promise<RetrievalResult> {
  const { intent, historyItems, signal, onToolActivity, mentionedMeetingIds } = params;

  // manage_todos always runs (even at depth: none) to build the proposal
  if (intent.depth === 'none' && intent.intent !== 'manage_todos') {
    return { context: '', citations: [], toolsUsed: [] };
  }

  const ctx: ExecutionContext = {
    intent,
    contextParts: [],
    citations: [],
    toolsUsed: [],
    historyItems,
    signal,
    onToolActivity,
    mentionedMeetingIds,
  };

  // Scoped pre-step: if user @mentioned specific meetings, do a scoped vector
  // search to retrieve relevant transcript chunks before the intent switch.
  // This augments (doesn't replace) the intent-based retrieval.
  if (mentionedMeetingIds?.length && intent.search_query) {
    await executeScopedSearch(ctx);
  }

  switch (intent.intent) {
    case 'meeting_search':
      await executeMeetingSearch(ctx);
      break;
    case 'meeting_recall':
      await executeMeetingRecall(ctx);
      break;
    case 'meeting_detail':
      await executeMeetingDetail(ctx);
      break;
    case 'meeting_list':
      await executeMeetingList(ctx);
      break;
    case 'action_items':
      await executeActionItems(ctx);
      break;
    case 'manage_todos':
      await executeManageTodos(ctx);
      break;
    case 'relationship':
      await executeRelationship(ctx);
      break;
    case 'cross_meeting':
      await executeCrossMeeting(ctx);
      break;
    case 'chat_recall':
      await executeChatRecall(ctx);
      break;
    case 'catch_up':
      await executeCatchUp(ctx);
      break;
  }

  return {
    context: ctx.contextParts.join('\n\n---\n\n'),
    citations: deduplicateCitations(ctx.citations),
    toolsUsed: ctx.toolsUsed,
  };
}

// ── Scoped Pre-Step ──

const SCOPED_SEARCH_LIMIT = 5;

/**
 * Scoped search: when user @mentions meetings, search within those specific
 * meetings for transcript chunks matching the query. Returns multiple chunks
 * per meeting (not grouped by meeting like global search).
 */
async function executeScopedSearch(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;
  const meetingIds = ctx.mentionedMeetingIds;
  if (!query || !meetingIds?.length) return;

  const call = makeToolCall('search_meetings', { query, scoped: true });
  ctx.onToolActivity({
    toolName: 'search_meetings',
    label: 'Searching meeting transcript…',
    status: 'calling',
    toolCall: call,
  });

  try {
    const results = await ragSearcher.search(query, {
      meetingIds,
      limit: SCOPED_SEARCH_LIMIT,
    });

    if (results.length > 0) {
      // Group chunks by meeting for readable output
      const byMeeting = new Map<string, typeof results>();
      for (const r of results) {
        const arr = byMeeting.get(r.meetingId) ?? [];
        arr.push(r);
        byMeeting.set(r.meetingId, arr);
      }

      const parts: string[] = [];
      for (const [, chunks] of byMeeting) {
        const title = chunks[0].meetingTitle;
        const excerpts = chunks.map(c => c.chunkText).join('\n\n');
        parts.push(`## Relevant excerpts from "${title}"\n\n${excerpts}`);
      }

      ctx.contextParts.push(parts.join('\n\n'));

      const citations = results.map(buildCitationFromSearch);
      ctx.citations.push(...citations);
    }

    ctx.toolsUsed.push('search_meetings');
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: 'Searching meeting transcript…',
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Found ${results.length} relevant excerpt(s)`,
        isError: false,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Scoped search failed:', error);
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: 'Searching meeting transcript…',
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Scoped search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
  }
}

// ── Intent Strategies ──

/**
 * meeting_search: Find which meetings match a topic (surface-level).
 * Uses ragSearcher directly for structured results, formats inline.
 */
async function executeMeetingSearch(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;
  if (!query) return;

  const call = makeToolCall('search_meetings', { query });
  ctx.onToolActivity({
    toolName: 'search_meetings',
    label: TOOL_LABELS.search_meetings,
    status: 'calling',
    toolCall: call,
  });

  try {
    const results = await ragSearcher.search(query, {
      limit: ctx.intent.max_meetings ?? 5,
    });

    const citations = results.map(buildCitationFromSearch);
    ctx.citations.push(...citations);
    ctx.toolsUsed.push('search_meetings');

    if (results.length > 0) {
      ctx.contextParts.push(formatSearchResults(results));
    }

    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Found ${results.length} meeting(s)`,
        isError: false,
        meta: { toolName: 'search_meetings', executionMs: 0, citations },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Search failed:', error);
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
  }
}

/**
 * meeting_recall: Search + deep-load top meetings.
 * ragSearcher for structured IDs, then get_meeting through toolExecutor.
 */
async function executeMeetingRecall(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;
  if (!query) return;

  // Step 1: Search for relevant meetings
  const searchCall = makeToolCall('search_meetings', { query });
  ctx.onToolActivity({
    toolName: 'search_meetings',
    label: TOOL_LABELS.search_meetings,
    status: 'calling',
    toolCall: searchCall,
  });

  let meetingIds: string[] = [];
  try {
    const results = await ragSearcher.search(query, {
      limit: (ctx.intent.max_meetings ?? 3) * 2, // over-fetch for dedup
    });

    ctx.citations.push(...results.map(buildCitationFromSearch));
    ctx.toolsUsed.push('search_meetings');

    // Deduplicate by meetingId, take top N
    const seen = new Set<string>();
    for (const r of results) {
      if (!seen.has(r.meetingId)) {
        seen.add(r.meetingId);
        meetingIds.push(r.meetingId);
      }
      if (meetingIds.length >= (ctx.intent.max_meetings ?? 3)) break;
    }

    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: `Found ${results.length} chunk(s) across ${meetingIds.length} meeting(s)`,
        isError: false,
        meta: {
          toolName: 'search_meetings',
          executionMs: 0,
          citations: results.map(buildCitationFromSearch),
        },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Search failed:', error);
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
    return;
  }

  // Step 2: Deep-load top meetings
  if (ctx.intent.depth === 'deep' && meetingIds.length > 0) {
    const fields = ctx.intent.requested_fields ?? ['summary', 'transcript'];
    for (const meetingId of meetingIds) {
      await executeTool(ctx, 'get_meeting', { meeting_id: meetingId, fields });
    }
  }
}

/**
 * meeting_detail: Search + load 1 specific meeting's requested fields.
 */
async function executeMeetingDetail(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;
  if (!query) return;

  // Find the target meeting
  const searchCall = makeToolCall('search_meetings', { query });
  ctx.onToolActivity({
    toolName: 'search_meetings',
    label: TOOL_LABELS.search_meetings,
    status: 'calling',
    toolCall: searchCall,
  });

  let targetMeetingId: string | undefined;
  try {
    const results = await ragSearcher.search(query, { limit: 3 });
    ctx.citations.push(...results.map(buildCitationFromSearch));
    ctx.toolsUsed.push('search_meetings');
    targetMeetingId = results[0]?.meetingId;

    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: targetMeetingId ? `Found meeting: ${targetMeetingId}` : 'No meetings found',
        isError: false,
        meta: {
          toolName: 'search_meetings',
          executionMs: 0,
          citations: results.map(buildCitationFromSearch),
        },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Search failed:', error);
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
    return;
  }

  if (targetMeetingId) {
    const fields = ctx.intent.requested_fields ?? [
      'summary',
      'transcript',
      'notes',
    ];
    await executeTool(ctx, 'get_meeting', {
      meeting_id: targetMeetingId,
      fields,
    });
  }
}

/**
 * meeting_list: List meetings chronologically via tool executor.
 */
async function executeMeetingList(ctx: ExecutionContext): Promise<void> {
  await executeTool(ctx, 'list_meetings', {
    count: ctx.intent.max_meetings ?? 10,
  });
}

/**
 * action_items: Get action items, optionally filtered.
 */
async function executeActionItems(ctx: ExecutionContext): Promise<void> {
  // If there's a search query, find the meeting first
  if (ctx.intent.search_query) {
    const searchCall = makeToolCall('search_meetings', {
      query: ctx.intent.search_query,
    });
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'calling',
      toolCall: searchCall,
    });

    try {
      const results = await ragSearcher.search(ctx.intent.search_query, {
        limit: 3,
      });
      ctx.toolsUsed.push('search_meetings');

      ctx.onToolActivity({
        toolName: 'search_meetings',
        label: TOOL_LABELS.search_meetings,
        status: 'done',
        toolCall: searchCall,
        result: {
          toolCallId: searchCall.id,
          content: `Found ${results.length} result(s)`,
          isError: false,
          meta: { toolName: 'search_meetings', executionMs: 0 },
        },
      });

      // Get action items for each found meeting
      const seen = new Set<string>();
      for (const r of results) {
        if (seen.has(r.meetingId)) continue;
        seen.add(r.meetingId);
        await executeTool(ctx, 'get_action_items', {
          meeting_id: r.meetingId,
          status: ctx.intent.action_item_filter ?? 'all',
        });
        if (seen.size >= 3) break;
      }
      return;
    } catch (error: unknown) {
      console.error('[RetrievalExecutor] Search failed:', error);
      ctx.onToolActivity({
        toolName: 'search_meetings',
        label: TOOL_LABELS.search_meetings,
        status: 'done',
        toolCall: searchCall,
        result: {
          toolCallId: searchCall.id,
          content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
          meta: { toolName: 'search_meetings', executionMs: 0 },
        },
      });
    }
  }

  // No search query or search failed → get all action items
  await executeTool(ctx, 'get_action_items', {
    status: ctx.intent.action_item_filter ?? 'all',
  });
}

/**
 * manage_todos: Create, toggle, update, or delete one or more todos.
 * If mutation.meeting_query is set, search for the meeting first via RAG.
 * Then call manage_todo tool for each mutation to build TodoProposals for user confirmation.
 */
async function executeManageTodos(ctx: ExecutionContext): Promise<void> {
  // Support both `mutations` array (preferred) and legacy singular `mutation`
  const mutations = ctx.intent.mutations
    || (ctx.intent.mutation ? [ctx.intent.mutation] : null);

  if (!mutations || mutations.length === 0) {
    ctx.contextParts.push('No mutation parameters found — cannot manage todo.');
    return;
  }

  for (const mutation of mutations) {
    let meetingId = '_general';
    let meetingTitle = 'General';

    // If user referenced a meeting, resolve it via RAG search
    if (mutation.meeting_query && !mutation.is_general) {
      try {
        const results = await ragSearcher.search(mutation.meeting_query, { limit: 1 });

        if (results.length > 0) {
          meetingId = results[0].meetingId;
          const historyItem = ctx.historyItems.find(h => h.id === meetingId);
          meetingTitle = historyItem?.title || results[0].meetingTitle || 'Unknown Meeting';
        } else {
          ctx.contextParts.push(`Could not find a meeting matching "${mutation.meeting_query}". Creating as a general todo.`);
        }
      } catch (error: unknown) {
        console.error('[RetrievalExecutor] Meeting search for manage_todos failed:', error);
        ctx.contextParts.push(`Meeting search failed. Creating as a general todo.`);
      }
    }

    // Call the manage_todo tool (builds proposal, does NOT write to DB)
    await executeTool(ctx, 'manage_todo', {
      action: mutation.action,
      text: mutation.todo_text,
      meeting_id: meetingId,
      meeting_title: meetingTitle,
      due_date: mutation.due_date,
      reminder_datetime: mutation.reminder_datetime,
      owner: mutation.owner,
      match_text: mutation.match_text,
    });
  }
}

/**
 * relationship: Query knowledge graph for entity relationships.
 * Uses graphDB directly, formats results inline.
 */
async function executeRelationship(ctx: ExecutionContext): Promise<void> {
  const target = ctx.intent.graph_target;
  if (!target) return;

  const call = makeToolCall('query_graph', {
    operation: 'search',
    query: target,
  });
  ctx.onToolActivity({
    toolName: 'query_graph',
    label: TOOL_LABELS.query_graph,
    status: 'calling',
    toolCall: call,
  });

  try {
    // Step 1: Search for the target entity
    const nodes = await graphDB.search({
      query: target,
      node_types: ctx.intent.graph_node_types,
      limit: ctx.intent.max_meetings ?? 20,
    });

    ctx.toolsUsed.push('query_graph');

    // Step 2: Get neighbors for top results
    const parts: string[] = [`## Graph: "${target}"\n`];
    if (nodes.length === 0) {
      parts.push('No matching entities found in the knowledge graph.');
    } else {
      for (const node of nodes.slice(0, 5)) {
        parts.push(`### [${node.type}] ${node.name}`);
        try {
          const neighbors = await graphDB.neighbors(
            node.id,
            ctx.intent.graph_edge_types,
            'both',
          );
          if (neighbors.length > 0) {
            for (const n of neighbors.slice(0, 10)) {
              parts.push(
                `  - ${n.via_edge_type} → [${n.node.type}] ${n.node.name}`,
              );
            }
          } else {
            parts.push('  (no connections)');
          }
        } catch {
          parts.push('  (graph traversal failed)');
        }
      }
    }

    ctx.contextParts.push(parts.join('\n'));

    ctx.onToolActivity({
      toolName: 'query_graph',
      label: TOOL_LABELS.query_graph,
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Found ${nodes.length} entity(ies)`,
        isError: false,
        meta: { toolName: 'query_graph', executionMs: 0 },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Graph query failed:', error);
    ctx.onToolActivity({
      toolName: 'query_graph',
      label: TOOL_LABELS.query_graph,
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content: `Graph error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'query_graph', executionMs: 0 },
      },
    });
  }
}

/**
 * cross_meeting: Search + load multiple meetings for comparison/aggregation.
 */
async function executeCrossMeeting(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;
  if (!query) return;

  // Search
  const searchCall = makeToolCall('search_meetings', { query });
  ctx.onToolActivity({
    toolName: 'search_meetings',
    label: TOOL_LABELS.search_meetings,
    status: 'calling',
    toolCall: searchCall,
  });

  let meetingIds: string[] = [];
  try {
    const results = await ragSearcher.search(query, {
      limit: (ctx.intent.max_meetings ?? 5) * 2,
    });

    ctx.citations.push(...results.map(buildCitationFromSearch));
    ctx.toolsUsed.push('search_meetings');

    const seen = new Set<string>();
    for (const r of results) {
      if (!seen.has(r.meetingId)) {
        seen.add(r.meetingId);
        meetingIds.push(r.meetingId);
      }
      if (meetingIds.length >= (ctx.intent.max_meetings ?? 5)) break;
    }

    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: `Found ${meetingIds.length} meeting(s)`,
        isError: false,
        meta: {
          toolName: 'search_meetings',
          executionMs: 0,
          citations: results.map(buildCitationFromSearch),
        },
      },
    });
  } catch (error: unknown) {
    console.error('[RetrievalExecutor] Search failed:', error);
    ctx.onToolActivity({
      toolName: 'search_meetings',
      label: TOOL_LABELS.search_meetings,
      status: 'done',
      toolCall: searchCall,
      result: {
        toolCallId: searchCall.id,
        content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      },
    });
    return;
  }

  // Deep-load each meeting
  const fields = ctx.intent.requested_fields ?? ['summary'];
  for (const meetingId of meetingIds) {
    await executeTool(ctx, 'get_meeting', { meeting_id: meetingId, fields });
  }

  // Optionally get action items across meetings
  if (
    ctx.intent.requested_fields?.includes('actionItems') ||
    ctx.intent.action_item_filter
  ) {
    for (const meetingId of meetingIds) {
      await executeTool(ctx, 'get_action_items', {
        meeting_id: meetingId,
        status: ctx.intent.action_item_filter ?? 'all',
      });
    }
  }
}

/**
 * chat_recall: Search past AI chat sessions.
 */
async function executeChatRecall(ctx: ExecutionContext): Promise<void> {
  const query = ctx.intent.search_query;

  if (query) {
    // Search chats
    const call = makeToolCall('search_chats', { query });
    ctx.onToolActivity({
      toolName: 'search_chats',
      label: TOOL_LABELS.search_chats,
      status: 'calling',
      toolCall: call,
    });

    try {
      const results = await chatSearcher.search(query, {
        limit: ctx.intent.max_meetings ?? 5,
      });
      ctx.toolsUsed.push('search_chats');

      if (results.length > 0) {
        ctx.contextParts.push(formatChatSearchResults(results));

        // Deep-load top result if needed
        if (ctx.intent.depth === 'deep' && results[0]) {
          ctx.onToolActivity({
            toolName: 'search_chats',
            label: TOOL_LABELS.search_chats,
            status: 'done',
            toolCall: call,
            result: {
              toolCallId: call.id,
              content: `Found ${results.length} session(s)`,
              isError: false,
              meta: { toolName: 'search_chats', executionMs: 0 },
            },
          });
          await executeTool(ctx, 'get_chat', {
            session_id: results[0].sessionId,
          });
          return;
        }
      }

      ctx.onToolActivity({
        toolName: 'search_chats',
        label: TOOL_LABELS.search_chats,
        status: 'done',
        toolCall: call,
        result: {
          toolCallId: call.id,
          content: `Found ${results.length} session(s)`,
          isError: false,
          meta: { toolName: 'search_chats', executionMs: 0 },
        },
      });
    } catch (error: unknown) {
      console.error('[RetrievalExecutor] Chat search failed:', error);
      ctx.onToolActivity({
        toolName: 'search_chats',
        label: TOOL_LABELS.search_chats,
        status: 'done',
        toolCall: call,
        result: {
          toolCallId: call.id,
          content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
          meta: { toolName: 'search_chats', executionMs: 0 },
        },
      });
    }
  } else {
    // No query → list recent chats
    await executeTool(ctx, 'list_chats', {
      limit: ctx.intent.max_meetings ?? 10,
    });
  }
}

/**
 * catch_up: Recent meetings + pending action items.
 */
async function executeCatchUp(ctx: ExecutionContext): Promise<void> {
  await executeTool(ctx, 'list_meetings', {
    count: ctx.intent.max_meetings ?? 5,
  });
  await executeTool(ctx, 'get_action_items', { status: 'pending' });
}

// ── Helpers ──

interface SearchResult {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  timestamp: number;
}

interface ChatResult {
  sessionId: string;
  sessionTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  lastMessageAt: number;
}

function buildCitationFromSearch(result: SearchResult): MeetingCitation {
  return {
    meetingId: result.meetingId,
    meetingTitle: result.meetingTitle,
    meetingTimestamp: result.timestamp,
    excerpt: result.chunkText.slice(0, 300),
    score: result.score,
  };
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No matching meetings found.';

  const lines: string[] = ['## Meeting Search Results\n'];
  // Deduplicate by meetingId, keep best score
  const byMeeting = new Map<string, SearchResult>();
  for (const r of results) {
    const existing = byMeeting.get(r.meetingId);
    if (!existing || r.score > existing.score) {
      byMeeting.set(r.meetingId, r);
    }
  }

  let i = 1;
  for (const [, r] of byMeeting) {
    const date = new Date(r.timestamp).toLocaleDateString();
    lines.push(
      `${i}. **${r.meetingTitle}** (${date}) [ID: ${r.meetingId}]`,
    );
    lines.push(`   Relevance: ${r.score > 0.02 ? 'high' : r.score > 0.01 ? 'medium' : 'low'}`);
    lines.push(`   > ${r.chunkText.slice(0, 200)}…\n`);
    i++;
  }

  return lines.join('\n');
}

function formatChatSearchResults(results: ChatResult[]): string {
  if (results.length === 0) return 'No matching chat sessions found.';

  const lines: string[] = ['## Chat Search Results\n'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const date = new Date(r.lastMessageAt).toLocaleDateString();
    lines.push(
      `${i + 1}. **${r.sessionTitle}** (${date}) [ID: ${r.sessionId}]`,
    );
    lines.push(`   > ${r.chunkText.slice(0, 200)}…\n`);
  }

  return lines.join('\n');
}

function deduplicateCitations(citations: MeetingCitation[]): MeetingCitation[] {
  const best = new Map<string, MeetingCitation>();
  for (const c of citations) {
    const existing = best.get(c.meetingId);
    if (!existing || c.score > existing.score) {
      best.set(c.meetingId, c);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}
