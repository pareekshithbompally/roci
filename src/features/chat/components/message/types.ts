import type { ChatPart, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';

/** Shared action callbacks — stable via useMemo in parent */
export interface ActionProps {
  onCopy?: (id: string, text: string) => void;
  onRerun?: () => void;
}

/** Citation handler callbacks — stable via useMemo in parent */
export interface CitationHandlers {
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
}

/** Tool activity — consumed by ActionBar tooltip */
export interface ToolActivityData {
  calls: Array<{ toolName: string; executionMs: number; resultSummary?: string }>;
  totalIterations: number;
  citations?: MeetingCitation[];
}

/** Top-level ChatMessage props — the router interface */
export interface ChatMessageProps {
  id: string;
  role: 'user' | 'model' | 'assistant' | 'system';
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage?: boolean;
  provider?: string;
  model?: string;
  state?: 'loading' | 'streaming' | 'complete';
  tokenCount?: number;
  tokensPerSecond?: number;
  toolActivity?: ToolActivityData;
  preparingTools?: boolean;
  isCopied?: boolean;
  actions: ActionProps;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}

/** UserMessage receives a subset */
export interface UserMessageProps {
  id: string;
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  isCopied?: boolean;
  actions: ActionProps;
}

/** AssistantMessage receives the rest */
export interface AssistantMessageProps {
  id: string;
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage: boolean;
  provider?: string;
  model?: string;
  state: 'loading' | 'streaming' | 'complete';
  tokenCount?: number;
  tokensPerSecond?: number;
  toolActivity?: ToolActivityData;
  preparingTools: boolean;
  isCopied?: boolean;
  actions: ActionProps;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}
