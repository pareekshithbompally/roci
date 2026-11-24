import type { LoadingStatus } from './loadingStatus';
import type { ChatMessage, MeetingCitation, WebCitation } from '@shared/types';

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
  message: ChatMessage;
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage?: boolean;
  /** What the header shows before the first word (label, and a percent when known) */
  loadingStatus?: LoadingStatus;
  isCopied?: boolean;
  actions: ActionProps;
  citationHandlers: CitationHandlers;
}

/** UserMessage receives a subset */
export type UserMessageProps = Pick<ChatMessageProps, 'message' | 'actions'>;

/** AssistantMessage receives the rest */
export type AssistantMessageProps = Omit<ChatMessageProps, 'isLastMessage'> & { isLastMessage: boolean };
