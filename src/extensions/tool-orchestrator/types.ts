/** Orchestration loop inputs, callbacks and activity state. */

import type { ChatMessage, AppSettings, ImagePart, ReasoningEffort } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { GenerationStats, StreamMetadata } from '@services/ai/types';
import type { MeetingCitation } from '@extensions/tools/types';
import type { ChatPromptOptions } from '@core/ai';

// ── Orchestrator Options ──

/** Input options for the orchestration loop */
export interface OrchestratorOptions {
  messages: ChatMessage[];
  /** The chat's model (a chat keeps the model of its first reply). */
  model: ResolvedModel;
  /** What the system prompt needs from the chat; the orchestrator adds the tools it sends and the model's modalities. */
  prompt: Omit<ChatPromptOptions, 'tools' | 'modalities'>;
  settings: AppSettings;
  providers: ModelProvider[];
  signal?: AbortSignal;
  /** Whether to skip tool attachment (model doesn't support tools). Default: false */
  skipRetrieval?: boolean;
  /** The chat's thinking level. */
  reasoningEffort: ReasoningEffort;
}

// ── Callbacks ──

/** Callbacks the orchestrator uses to communicate with the UI layer */
export interface OrchestratorCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  /** The model's thinking as it streams, with tokens and speed when a local server reports them. */
  onReasoning: (text: string, generation?: GenerationStats) => void;
  onToolActivity: (activity: ToolActivity) => void;
}

// ── Tool Activity ──

/** One tool's progress as it streams, for Roci's tools and providers' built-in ones alike: the chat's only tool contract. */
export type ToolActivity = {
  toolCallId: string;
  toolName: string;
  /** MCP server that owns the tool; absent for built-ins. */
  source?: string;
} & (
  | { phase: 'start' }
  | { phase: 'input'; arguments: Record<string, unknown> }
  | { phase: 'end'; arguments?: Record<string, unknown>; result: ToolOutcome }
);

/** What a finished tool shows: its text, whether it failed, how long it took, any meeting citations, and an image it made. */
export interface ToolOutcome {
  content: string;
  isError: boolean;
  executionMs?: number;
  citations?: MeetingCitation[];
  image?: ImagePart;
}
