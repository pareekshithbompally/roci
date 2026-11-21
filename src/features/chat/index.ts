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
export { useChatRuntime } from './hooks';
export { canSendDraft } from './utils';
export { formatToolName } from './components/tool-call/toolCallTitle';
export { toolCallIcon } from './components/tool-call/toolCallIcons';
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
  memoryProposalStore,
  sameMemory,
  useMemoryProposals,
} from './stores';
export type { MemoryProposal, TodoChange, TodoProposal } from './stores';
