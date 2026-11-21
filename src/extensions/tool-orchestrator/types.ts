/** Orchestration loop inputs and callbacks. */

import type { ChatMessage, ChatPart, AppSettings, ReasoningEffort } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { GenerationStats, StreamProgress } from '@services/ai/types';
import type { ChatPromptOptions } from '@core/ai';

/** Input options for the orchestration loop */
export interface OrchestratorOptions {
  messages: ChatMessage[];
  /** The chat replying: its tools record the models they call under it. */
  sessionId: string;
  /** The id the reply's message gets. */
  messageId: string;
  /** The chat's model (a chat keeps the model of its first reply). */
  model: ResolvedModel;
  /** What the system prompt needs from the chat; the orchestrator adds the tools it sends and the model's modalities. */
  prompt: Omit<ChatPromptOptions, 'tools' | 'modalities'>;
  settings: AppSettings;
  providers: ModelProvider[];
  signal?: AbortSignal;
  /** The chat's thinking level. */
  reasoningEffort: ReasoningEffort;
}

/** Callbacks the orchestrator uses to communicate with the UI layer */
export interface OrchestratorCallbacks {
  /** The reply's parts as the AI SDK builds them, on every change. */
  onParts: (parts: ChatPart[]) => void;
  /** What happens before the first word (the model list, a model load, reading the prompt); null once it's past. */
  onProgress: (progress: StreamProgress | null) => void;
  /** Tokens and speed while a local server generates. */
  onGeneration: (stats: GenerationStats) => void;
}
