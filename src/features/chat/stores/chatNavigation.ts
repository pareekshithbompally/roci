/** Where the chat is on screen: starting and opening chats, the meeting chat, and ⌘L focusing the composer. */

import type { MutableRefObject } from 'react';
import { useAppStore } from '@shared/stores/appStore';
import { endCreate, startCreate } from '@shared/stores/createStore';
import { AppStatus } from '@shared/types';
import { useChatStore } from './chatStore';

/** The mounted chat composer's textarea (⌘L focus target). */
const chatInputRef: MutableRefObject<HTMLTextAreaElement | null> = { current: null };

/** ⌘L arrived while no composer was mounted; the next one to mount takes focus. */
let composerFocusPending = false;

/** Focus the composer (⌘L); with none on screen, navigate to one and focus it as it mounts. */
export function focusChatComposer(): void {
  if (chatInputRef.current) {
    chatInputRef.current.focus();
    return;
  }
  composerFocusPending = true;
  const { selectedHistoryId, setCurrentView } = useAppStore.getState();
  setCurrentView('home');
  if (selectedHistoryId) startCreate('chat', selectedHistoryId);
}

/** The meeting chat full screen: the same chat, now the selected one in the sidebar (or the home composer if unsent). */
export function expandMeetingChat(): void {
  const app = useAppStore.getState();
  const { currentSessionId } = useChatStore.getState();
  endCreate();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(currentSessionId ? AppStatus.CHAT : AppStatus.IDLE);
}

/** Closes the meeting chat; an unsent draft (and its meeting chip) goes with it. */
export function closeMeetingChat(): void {
  endCreate();
  const chat = useChatStore.getState();
  if (chat.currentSessionId) return;
  chat.newChat();
  chat.setSelectedMeetingRefs([]);
}

/** Sends in a fresh chat on home: the composer's draft, or `text` (`roci://ask`). The draft is read before anything is reset. */
export function askInNewChat(text?: string): void {
  startNewChat();
  useChatStore.setState({ draftMeetingId: null });
  useAppStore.getState().setStatus(AppStatus.CHAT);
  void useChatStore.getState().sendMessage(text);
}

/** Back to the empty home composer: no meeting, session, or result selected (⌘N, New chat). */
export function startNewChat(): void {
  const app = useAppStore.getState();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(AppStatus.IDLE);
  useChatStore.getState().setCurrentSessionId(null);
}

/** Opens a saved chat in the main view (the sidebar's chats, the gallery's "Open chat"). */
export function openChat(sessionId: string): void {
  useChatStore.getState().selectSession(sessionId);
  const app = useAppStore.getState();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(AppStatus.CHAT);
}

/** ChatInput registers its textarea on mount (null on unmount). */
export function registerChatComposer(textarea: HTMLTextAreaElement | null): void {
  chatInputRef.current = textarea;
  if (!textarea || !composerFocusPending) return;
  composerFocusPending = false;
  textarea.focus();
}
