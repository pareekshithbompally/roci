/** Chat Zustand store: the open chat, loaded chats, the composer's draft and the reply under way. Sending and generating
 *  replies is chatReply; loaded chats and saving, chatSessions; message shapes, chatMessages; navigation, chatNavigation. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ChatSession, FileUIPart, ReasoningEffort } from '@shared/types';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { chatService } from '@services/chat.service';
import type { StreamProgress } from '@services/ai/types';
import { assetsService } from '@services/storage';
import { itemEdits, refreshItems } from '@shared/query/items';
import { CHAT_MAX_ATTACHMENTS } from '@config/chat.config';
import { UI_CONFIG } from '@config/ui.config';
import { chatModelOf } from '@features/chat/utils';
import type { ModelRef } from '@services/ai/models';
// the live store alone (a light module), not the whole recording feature
import { runningTranscript } from '@features/recording/live/meetingLiveStore';
import { attachmentPart } from './chatMessages';
import { attachmentMediaType, withSendWhole } from '@shared/utils/chatParts';
import { createSessions } from './chatSessions';
import { createReplies } from './chatReply';

export { injectChatRefs } from './chatReply';

/** The pending "Copied" reset; a newer copy replaces it. */
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

// ── Chat writes: the store first, then every list reads it again (renames and deletes already show, via itemEdits) ──

/** One chat write; never rejects. */
async function writeChat(write: () => Promise<void>, what: string): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error: unknown) {
    console.error(`[ChatStore] Failed to ${what}:`, error);
    return false;
  } finally {
    refreshItems();
  }
}

// ── Types ──

export interface ChatStoreState {
  loadedSessions: Map<string, ChatSession>;
  currentSessionId: string | null;
  isSessionLoading: boolean;
  input: string;
  /** The chat whose reply is being generated (one at a time); null when none is. */
  replyingSessionId: string | null;
  copiedMessageId: string | null;
  selectedMeetingRefs: MeetingListItem[];
  /** The meeting a not-yet-sent chat belongs to (meeting chat); the first message saves the chat linked to it. */
  draftMeetingId: string | null;
  /** The thinking level picked before a new chat exists; the chat keeps it once created. */
  draftReasoningEffort: ReasoningEffort;
  /** What happens before the reply's first word (the model list, a model load, reading the prompt). */
  aiActivity: StreamProgress | null;
  pendingAttachments: FileUIPart[];

  setInput: (input: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  newChat: () => void;
  /** Sends the composer's draft (or only `textOverride`, e.g. a suggestion) in the current chat, or a new one. */
  sendMessage: (textOverride?: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  /** Deletes a chat; throws when the store refused, after the list is rolled back. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Drops chats the store already removed (Keep, Delete All) from memory, so no save brings them back. */
  forgetSessions: (sessionIds: string[]) => void;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  /** Stops the reply in flight, wherever it is, keeping what it has written so far. */
  stopGeneration: () => void;
  copyMessage: (messageId: string, text: string) => void;
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  /** Sets the current chat's thinking level (saved with the chat), or the new chat's before it exists. */
  setReasoningEffort: (effort: ReasoningEffort) => void;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  /** A pending document goes whole (true) or is looked up in when needed (false, the default). */
  setAttachmentSendWhole: (index: number, whole: boolean) => void;
  addScreenshotAttachment: (base64: string, name: string) => Promise<void>;
  /** A fresh, unsaved chat about `meeting`, with the meeting attached as context; thinking Off while the meeting records, so
   *  answers come quickly (the picker still raises it). */
  startMeetingChat: (meeting: MeetingListItem) => void;
  /** Writes a session to disk and its row to the chat list; never rejects. */
  persistSession: (session: ChatSession) => Promise<void>;
  /** Changes the chats in memory (useChatRuntime: the open chat loaded, others let go). */
  setLoadedSessions: (updater: (prev: Map<string, ChatSession>) => Map<string, ChatSession>) => void;
}

// ── Store ──

export const useChatStore = create<ChatStoreState>((set, get) => ({
  // ── State ──

  loadedSessions: new Map(),
  currentSessionId: null,
  isSessionLoading: false,
  input: '',
  replyingSessionId: null,
  copiedMessageId: null,
  selectedMeetingRefs: [],
  draftMeetingId: null,
  draftReasoningEffort: 'provider-default',
  aiActivity: null,
  pendingAttachments: [],

  // ── Session management ──

  setInput: (input) => set({ input }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setLoadedSessions: (updater) => set((state) => ({ loadedSessions: updater(state.loadedSessions) })),

  newChat: () =>
    set({
      draftMeetingId: null,
      currentSessionId: null,
      draftReasoningEffort: 'provider-default',
      input: '',
    }),

  selectSession: (sessionId) =>
    set((state) => ({ currentSessionId: sessionId, isSessionLoading: !state.loadedSessions.has(sessionId) })),

  deleteSession: async (sessionId) => {
    if (replies.isReplyingIn(sessionId)) get().stopGeneration();
    replies.cancelExtras(sessionId);
    set((state) => {
      const loadedSessions = new Map(state.loadedSessions);
      loadedSessions.delete(sessionId);
      return { loadedSessions, currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId };
    });
    await itemEdits.remove(sessionId);
    const deleted = await writeChat(() => chatService.deleteSession(sessionId), 'delete chat');
    if (!deleted) throw new Error(`Chat ${sessionId} was not deleted`);
  },

  forgetSessions: (sessionIds) => {
    sessionIds.forEach(replies.cancelExtras);
    const gone = new Set(sessionIds);
    set((state) => ({ loadedSessions: new Map([...state.loadedSessions].filter(([id]) => !gone.has(id))) }));
  },

  renameSession: async (sessionId, newTitle) => {
    // Memory first, so a save landing during the rename writes the new title too.
    const existing = sessions.sessionOf(sessionId);
    if (existing) sessions.putSession({ ...existing, title: newTitle });
    await itemEdits.rename(sessionId, newTitle);
    await writeChat(() => chatService.renameSession(sessionId, newTitle), 'rename chat');
  },

  copyMessage: (messageId, text) => {
    navigator.clipboard.writeText(text).catch((error: unknown) =>
      console.error('[ChatStore] Failed to copy message:', error)
    );
    set({ copiedMessageId: messageId });
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => set({ copiedMessageId: null }), UI_CONFIG.copiedFeedbackMs);
  },

  setSelectedMeetingRefs: (selectedMeetingRefs) => set({ selectedMeetingRefs }),

  setReasoningEffort: (effort) => {
    const { currentSessionId } = get();
    const session = currentSessionId ? sessions.sessionOf(currentSessionId) : undefined;
    if (!session) {
      set({ draftReasoningEffort: effort });
      return;
    }
    // In memory at once, so the very next message uses it; then saved.
    const updated = { ...session, reasoningEffort: effort };
    sessions.putSession(updated);
    sessions.saveSession(updated);
  },

  // ── Persist ──

  persistSession: async (session) => {
    await writeChat(() => chatService.persistSession(session), 'save chat');
  },

  // ── Attachments ──

  // Saved as a kept file at once (its chat claims it when the message is saved; one never sent is swept after a day); the
  // message carries its app path.
  addAttachment: async (file) => {
    if (get().pendingAttachments.length >= CHAT_MAX_ATTACHMENTS) return;
    try {
      const mediaType = attachmentMediaType(file.type, file.name);
      const saved = await assetsService.saveFile(file, mediaType);
      const part = attachmentPart(mediaType, saved.appPath, file.name);
      set((state) => ({ pendingAttachments: [...state.pendingAttachments, part] }));
    } catch (error: unknown) {
      console.error('[ChatStore] Failed to add attachment:', error);
    }
  },

  removeAttachment: (index) =>
    set((state) => ({ pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index) })),

  setAttachmentSendWhole: (index, whole) =>
    set((state) => ({ pendingAttachments: state.pendingAttachments.map((part, i) => (i === index ? withSendWhole(part, whole) : part)) })),

  addScreenshotAttachment: (base64, name) =>
    get().addAttachment(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, { type: 'image/png' })),

  startMeetingChat: (meeting) =>
    set({
      currentSessionId: null,
      draftMeetingId: meeting.id,
      selectedMeetingRefs: [meeting],
      input: '',
      pendingAttachments: [],
      draftReasoningEffort: runningTranscript(meeting.id) === null ? 'provider-default' : 'none',
    }),

  // ── Sending ──

  sendMessage: (textOverride) => replies.send(textOverride),

  stopGeneration: () => replies.stop(),
}));

const sessions = createSessions(useChatStore);
const replies = createReplies(useChatStore, sessions);

// ── Selectors ──

export const useChatCurrentSessionId = () => useChatStore((s) => s.currentSessionId);

/** The current chat's thinking level, or the level picked for the chat about to start. */
export const useChatReasoningEffort = () =>
  useChatStore((s) => {
    const session = s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined;
    return session ? session.reasoningEffort ?? 'provider-default' : s.draftReasoningEffort;
  });

/** The provider and model the open chat is locked to; null for a new chat (it takes the chat model setting). */
export const useChatModelLock = (): ModelRef | null =>
  useChatStore(useShallow((s) => chatModelOf(s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined) ?? null));

/** The open chat, or null before one is chosen or while it loads. */
export const useCurrentSession = (): ChatSession | null =>
  useChatStore(useShallow((s) => (s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) ?? null : null)));
