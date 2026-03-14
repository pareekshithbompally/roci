/**
 * Chat Feature Module
 * 
 * Complete chat functionality with AI messaging.
 */

// Components
export { ChatPanel, ChatView, ChatMessage, ChatInput, ChatHistoryList } from './components';

// Hooks
export { useChat } from './hooks';

// Re-export context for provider usage
export { ChatProvider, useChat as useChatContext } from '@shared/contexts/ChatContext';
