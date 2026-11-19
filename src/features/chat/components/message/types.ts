import type { LoadingStatus } from './loadingStatus';
import type { ChatPart, ContextTokens, MeetingCitation, WebCitation, InlineCitationSpan } from '@shared/types';

/** Shared action callbacks — stable via useMemo in parent */
export interface ActionProps {
  onCopy?: (id: string, text: string) => void;
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
  meetingRefs?: Array<{ id: string; title: string }>;
  timestamp?: number;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage?: boolean;
  provider?: string;
  model?: string;
  state?: 'loading' | 'streaming' | 'complete';
  /** What the header shows before the first word (label, and a percent when known) */
  loadingStatus?: LoadingStatus;
  isError?: boolean;
  /** The reply's share of the context window (what the gauge reads). */
  context?: ContextTokens;
  tokensPerSecond?: number;
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
  meetingRefs?: Array<{ id: string; title: string }>;
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
  /** What the header shows before the first word (label, and a percent when known) */
  loadingStatus?: LoadingStatus;
  isError?: boolean;
  /** The reply's share of the context window (what the gauge reads). */
  context?: ContextTokens;
  tokensPerSecond?: number;
  meetingCitations?: MeetingCitation[];
  isCopied?: boolean;
  actions: ActionProps;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}
