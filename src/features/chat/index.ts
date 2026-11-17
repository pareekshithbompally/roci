// Components
export {
  ChatShell,
  MeetingChat,
  ChatView,
  ChatMessage,
  ChatInput,
  ModelPicker,
} from './components';
export type { ChatShellProps } from './components';

// Hooks
export { useChatRuntime, useChatIndex } from './hooks';
export { canSendDraft } from './utils';
export { useSpeechInput } from './hooks/useSpeechInput';
export type { SpeechState, UseSpeechInputResult } from './hooks/useSpeechInput';
export { useVoiceCapture } from './hooks/useVoiceCapture';
export type { UseVoiceCaptureOptions, UseVoiceCaptureResult } from './hooks/useVoiceCapture';

// Stores
export {
  useChatStore,
  focusChatComposer,
  startNewChat,
  openChat,
  askInNewChat,
  useChatCurrentSessionId,
  todoProposalStore,
  commitTodoProposal,
  useTodoProposals,
  useTodoProposal,
  GENERAL_MEETING_ID,
  GENERAL_MEETING_TITLE,
} from './stores';
export type { TodoProposal } from './stores';
