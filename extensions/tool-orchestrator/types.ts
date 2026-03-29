/**
 * Tool Orchestrator Types
 *
 * Defines the orchestration loop's inputs, callbacks, and activity state.
 */

import type { ChatMessage, HistoryItem, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import type { StreamMetadata, ToolChoice } from '@/services/ai/types';
import type { ChatPart } from '@/types';
import type { TodoProposal } from '@features/chat/stores/todoProposalStore';
import type { ToolCall, ToolResult, MeetingCitation } from '@extensions/tools/types';

// ── Intent Classification (Step 1) ──

export type IntentType =
  | 'general'
  | 'meeting_search'
  | 'meeting_recall'
  | 'meeting_detail'
  | 'meeting_list'
  | 'action_items'
  | 'manage_todos'
  | 'relationship'
  | 'cross_meeting'
  | 'chat_recall'
  | 'catch_up';

/** Mutation parameters extracted by the intent classifier for manage_todos */
export interface TodoMutation {
  action: 'create' | 'toggle' | 'update' | 'delete';
  todo_text?: string;
  due_date?: string;
  reminder_datetime?: string;
  owner?: string;
  meeting_query?: string;
  is_general?: boolean;
  /** For toggle/update/delete — text to fuzzy-match against existing todos */
  match_text?: string;
}

export interface IntentClassification {
  intent: IntentType;
  confidence: 'high' | 'medium';
  search_query?: string;
  requested_fields?: ('summary' | 'transcript' | 'notes' | 'actionItems')[];
  action_item_filter?: 'pending' | 'completed' | 'all';
  mutation?: TodoMutation;
  /** Multiple mutations — preferred over singular `mutation` for batch requests */
  mutations?: TodoMutation[];
  graph_target?: string;
  graph_node_types?: string[];
  graph_edge_types?: string[];
  temporal_hint?: string;
  max_meetings?: number;
  depth: 'none' | 'surface' | 'deep';
}

// ── Retrieval Result (Step 2) ──

export interface RetrievalResult {
  /** Formatted context string to inject into synthesis prompt */
  context: string;
  /** Meeting citations for Sources UI panel */
  citations: MeetingCitation[];
  /** Which tools were executed (for UI activity indicators) */
  toolsUsed: string[];
}

/** Input options for the orchestration loop */
export interface OrchestratorOptions {
  messages: ChatMessage[];
  /** Required — built by buildChatRequest(), no fallback needed */
  systemPrompt: string;
  contextBlock?: string;
  settings: AppSettings;
  providers: ModelProvider[];
  historyItems: HistoryItem[];
  signal?: AbortSignal;
  webSearchEnabled?: boolean;
  toolChoice?: ToolChoice;
  /** Whether to skip Phase 1 retrieval (model doesn't support tools). Default: false */
  skipRetrieval?: boolean;
  /** Formatted temporal context string from formatTemporalContext(). */
  temporalContext?: string;
  /** Meeting IDs from @mentions — enables scoped vector search in retrieval */
  mentionedMeetingIds?: string[];
}

/** Callbacks the orchestrator uses to communicate with the UI layer */
export interface OrchestratorCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  onMediaPart?: (part: ChatPart) => void;
  onToolActivity: (activity: ToolActivity) => void;
  /** Called when a manage_todos intent produces a proposal for user confirmation */
  onProposal?: (proposal: TodoProposal) => void;
}

/** UI-facing tool activity state */
export interface ToolActivity {
  /** Which tool is currently executing */
  toolName: string;
  /** Friendly label for the UI (e.g. "Searching meetings…") */
  label: string;
  /** 'calling' while executing, 'done' after result received */
  status: 'calling' | 'done';
  /** The tool call that triggered this activity */
  toolCall: ToolCall;
  /** Result, populated when status is 'done' */
  result?: ToolResult;
}
