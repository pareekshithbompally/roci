/** Orchestration loop inputs, callbacks and activity state. */

import type { ChatMessage, HistoryItem, AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { StreamMetadata } from '@services/ai/types';
import type { ToolCall, ToolResult } from '@extensions/tools/types';

// ── Orchestrator Options ──

/** Input options for the orchestration loop */
export interface OrchestratorOptions {
  messages: ChatMessage[];
  /** Required — built by buildChatRequest(), no fallback needed */
  systemPrompt: string;
  settings: AppSettings;
  providers: ModelProvider[];
  historyItems: HistoryItem[];
  signal?: AbortSignal;
  webSearchEnabled?: boolean;
  /** Whether to skip tool attachment (model doesn't support tools). Default: false */
  skipRetrieval?: boolean;
}

// ── Callbacks ──

/** Callbacks the orchestrator uses to communicate with the UI layer */
export interface OrchestratorCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  onToolActivity: (activity: ToolActivity) => void;
}

// ── Tool Activity ──

/** UI-facing tool activity state */
export interface ToolActivity {
  /** Which tool is currently executing */
  toolName: string;
  /** MCP server that owns the tool; absent for built-ins */
  source?: string;
  /** Friendly label for the UI (e.g. "Searching meetings…") */
  label: string;
  /** 'calling' while executing, 'done' after result received */
  status: 'calling' | 'done';
  /** The tool call that triggered this activity */
  toolCall: ToolCall;
  /** Result, populated when status is 'done' */
  result?: ToolResult;
}
