import type { ChatPart, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';

/** Shared action callbacks — stable via useMemo in parent */
export interface ActionProps {
  onCopy?: (id: string, text: string) => void;
  onRerun?: () => void;
}

/** Citation handler callbacks — stable via useMemo in parent */
export interface CitationHandlers {
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllMeetingCitations?: (citations: MeetingCitation[]) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
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
  isError?: boolean;
  tokenCount?: number;
  tokensPerSecond?: number;
  /** @deprecated Use meetingCitations instead — kept for backward compat with old persisted messages */
  toolActivity?: {
    calls: Array<{ toolName: string; executionMs: number; resultSummary?: string }>;
    totalIterations: number;
    citations?: MeetingCitation[];
  };
  meetingCitations?: MeetingCitation[];
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
  isError?: boolean;
  tokenCount?: number;
  tokensPerSecond?: number;
  /** @deprecated Kept for backward compat lazy migration */
  toolActivity?: ChatMessageProps['toolActivity'];
  meetingCitations?: MeetingCitation[];
  isCopied?: boolean;
  actions: ActionProps;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}
