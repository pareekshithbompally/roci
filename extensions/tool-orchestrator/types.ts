/**
 * Tool Orchestrator Types
 *
 * Defines the orchestration loop's inputs, callbacks, and activity state.
 */

import type { ChatMessage, HistoryItem, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import type { StreamMetadata, ToolChoice } from '@/services/ai/types';
import type { ChatPart } from '@/types';
import type { ToolCall, ToolResult } from '@extensions/tools/types';
import type { OutputSchema } from '@core/ai/types';

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
  outputSchema?: OutputSchema;
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
