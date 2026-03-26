/**
 * Tool Orchestrator Types
 *
 * Defines the orchestration loop's inputs, callbacks, and activity state.
 */

import type { ChatMessage, HistoryItem, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import type { StreamMetadata, ToolChoice } from '@/services/ai/types';
import type { ChatPart } from '@/types';
import type { ToolCall, ToolResult, MeetingCitation } from '@extensions/tools/types';

// ── Intent Classification (Step 1) ──

export type IntentType =
  | 'general'
  | 'meeting_search'
  | 'meeting_recall'
  | 'meeting_detail'
  | 'meeting_list'
  | 'action_items'
  | 'relationship'
  | 'cross_meeting'
  | 'chat_recall'
  | 'catch_up';

export interface IntentClassification {
  intent: IntentType;
  confidence: 'high' | 'medium';
  search_query?: string;
  requested_fields?: ('summary' | 'transcript' | 'notes' | 'actionItems')[];
  action_item_filter?: 'pending' | 'completed' | 'all';
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
}

/** Callbacks the orchestrator uses to communicate with the UI layer */
export interface OrchestratorCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  onMediaPart?: (part: ChatPart) => void;
  onToolActivity: (activity: ToolActivity) => void;
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
