/**
 * Chat Feature Module
 */

// Components
export {
  ChatShell,
  ChatPanel,
  ChatView,
  ChatMessage,
  ChatInput,
  ChatHistoryList,
} from './components';
export type { ChatShellProps } from './components';

// Hooks
export { useChat } from './hooks';
export { useSpeechInput } from './hooks/useSpeechInput';
export type { SpeechState, UseSpeechInputResult } from './hooks/useSpeechInput';

// Stores
export {
  useChatStore,
  chatInputRef,
  injectChatRefs,
  useChatSessionIndex,
  useChatCurrentSessionId,
  useChatInitialized,
  useChatSessionLoading,
  useChatInput,
  useChatIsLoading,
  useChatViewHistory,
  useChatSearchQuery,
  useChatDebouncedSearchQuery,
  useChatCopiedMessageId,
  useChatSelectedMeetingRefs,
  useChatWebSearchEnabled,
  useChatAiActivity,
  useChatDeleteConfirmId,
  useChatPendingAttachments,
  useCurrentSession,
  useFilteredIndexEntries,
  useChatActions,
  todoProposalStore,
  useTodoProposals,
  useTodoProposal,
  GENERAL_MEETING_ID,
  GENERAL_MEETING_TITLE,
} from './stores';
export type { TodoProposal } from './stores';
