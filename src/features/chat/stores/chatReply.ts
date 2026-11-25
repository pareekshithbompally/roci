/** Sending a question and generating its reply, one at a time: begin, stream, settle (complete, failed or stopped), then
 *  the title and follow-ups asked for once it's done. Given the chat store, so the store doesn't have to be imported back. */

import type { StoreApi } from 'zustand';
import type { AppSettings, ChatMessage, ChatSession } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate, type ChatExtras } from '@extensions/tool-orchestrator';
import { formatChatTimeContext, type ChatExtrasWant } from '@core/ai';
import { logUsage } from '@extensions/usage';
import { queryClient } from '@shared/query/queryClient';
import { itemCountsQuery } from '@shared/query/items';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { CHAT_ERROR_COPY } from '@config/chat.config';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { canSendDraft, chatModelOf, draftTitle } from '@features/chat/utils';
import { errorMessage } from '@shared/utils/errors';
import { offlineError } from '@services/ai/errors';
import { chatPersonalization } from '@shared/utils/personalization';
import { isShownPart, messageText } from '@shared/utils/chatParts';
import { streamingStore } from './streamingStore';
import type { ChatStoreState } from './chatStore';
import type { Sessions } from './chatSessions';
import {
  NO_MODEL_REPLY, STOPPED_REPLY, lockedModelGoneReply, questionMessage, tokensPerSecond, withMeetings, withMetadata,
  withoutSuggestions, type Question,
} from './chatMessages';

/** Injected by useChatRuntime from Settings. */
const injectedRefs = {
  settings: null as AppSettings | null,
  providers: null as ModelProvider[] | null,
};

export function injectChatRefs(refs: { settings: AppSettings | null; providers: ModelProvider[] | null }) {
  Object.assign(injectedRefs, refs);
}

/** "Reply ready" while Roci is in the background (Settings › Notifications › Chat replies). */
function notifyReply(sessionId: string, text: string): void {
  const max = NOTIFICATIONS_CONFIG.chat.bodyMaxChars;
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  notifyAppEvent({ id: `chat:${sessionId}`, kind: 'chatReplies', tone: 'success', inFront: 'quiet', title: 'Reply ready', body });
}

/** The one reply being generated: its chat, its message, and its own Stop (which also ends its title and follow-ups call). */
interface Reply {
  sessionId: string;
  messageId: string;
  controller: AbortController;
}

/** Everything a reply needs besides its Reply handle. */
interface ReplyRequest {
  session: ChatSession;
  question: Question;
  resolved: NonNullable<ReturnType<typeof resolveChatModel>>;
  settings: AppSettings;
  providers: ModelProvider[];
  isNewSession: boolean;
}

/** What's asked for after the reply, as Settings › Default Models › Titles & follow-ups say: a new chat's title, follow-ups. */
function extrasWanted({ settings, isNewSession }: Pick<ReplyRequest, 'settings' | 'isNewSession'>): ChatExtrasWant {
  return { title: isNewSession && settings.chatTitles !== false, suggestions: settings.followUps !== false };
}

/** When the reply's first word arrived. */
interface StreamTally {
  firstTextAt: number;
}

export function createReplies(store: StoreApi<ChatStoreState>, sessions: Sessions) {
  const { sessionOf, putSession, patchMessage, settle, saveSession } = sessions;
  let activeReply: Reply | null = null;
  /** Each chat's settled reply whose title and follow-ups are still coming. */
  const awaitingExtras = new Map<string, Reply>();

  /** Still the reply in flight and not stopped; a stopped or finished reply writes nothing more. */
  const isLive = (reply: Reply): boolean => activeReply === reply && !reply.controller.signal.aborted;

  function beginReply(sessionId: string): Reply {
    const reply = { sessionId, messageId: (Date.now() + 1).toString(), controller: new AbortController() };
    activeReply = reply;
    store.setState({ replyingSessionId: sessionId, aiActivity: null });
    return reply;
  }

  function endReply(reply: Reply): void {
    if (activeReply !== reply) return;
    activeReply = null;
    store.setState({ replyingSessionId: null, aiActivity: null });
  }

  /** The composer's whole draft, or only `textOverride` (a suggestion, `roci://ask`), which leaves the draft alone. */
  function questionToSend(textOverride: string | undefined): Question {
    if (textOverride !== undefined) return { text: textOverride.trim(), attachments: [], meetings: [] };
    const { input, pendingAttachments, selectedMeetingRefs } = store.getState();
    return { text: input.trim(), attachments: pendingAttachments, meetings: selectedMeetingRefs };
  }

  /** The chat a question goes into: the current one, or a new one built from the draft. */
  function targetSessionFor({ text, attachments }: Question): ChatSession | undefined {
    const { currentSessionId, draftMeetingId, draftReasoningEffort } = store.getState();
    if (currentSessionId) return sessionOf(currentSessionId);
    return {
      id: Date.now().toString(),
      title: draftTitle(text, attachments),
      lastMessageAt: Date.now(),
      messages: [],
      ...(draftMeetingId && { meetingId: draftMeetingId }),
      ...(draftReasoningEffort !== 'provider-default' && { reasoningEffort: draftReasoningEffort }),
    };
  }

  /** The conversation with the question carrying its attached meetings, recorded on it (saved when the reply settles) so
   *  every later turn sends them with it. */
  function withMeetingContext(reply: Reply, messages: ChatMessage[], meetingContext: string): ChatMessage[] {
    const question = messages.at(-1);
    if (!question) return messages;
    patchMessage(reply.sessionId, question.id, (m) => withMeetings(m, meetingContext));
    return [...messages.slice(0, -1), withMeetings(question, meetingContext)];
  }

  /** Ends the title and follow-ups call of the chat's last reply, if it is still running (the chat's next message, its delete). */
  function cancelExtras(sessionId: string): void {
    awaitingExtras.get(sessionId)?.controller.abort();
    awaitingExtras.delete(sessionId);
  }

  /** A finished reply's title and follow-ups, once they arrive and unless the call was ended: the title only while the chat
   *  still has the title it had when the reply settled (a rename meanwhile wins); follow-ups only while the reply is still
   *  the chat's last message. */
  function applyExtras(reply: Reply, settledTitle: string | undefined, { title, suggestions }: ChatExtras): void {
    const { sessionId, messageId, controller } = reply;
    if (awaitingExtras.get(sessionId) === reply) awaitingExtras.delete(sessionId);
    if (controller.signal.aborted) return;
    if (title && sessionOf(sessionId)?.title === settledTitle) void store.getState().renameSession(sessionId, title);
    if (suggestions.length === 0 || sessionOf(sessionId)?.messages.at(-1)?.id !== messageId) return;
    saveSession(patchMessage(sessionId, messageId, (m) => withMetadata(m, { suggestions })));
  }

  /** Streams the reply into `streamingStore`; every callback is a no-op once the reply is stopped. */
  async function streamReply(reply: Reply, request: ReplyRequest, tally: StreamTally) {
    const { session, question, resolved, settings, providers } = request;
    const signal = reply.controller.signal;

    const context = await contextPipeline.resolve({ meetingIds: question.meetings.map((m) => m.id), signal });
    if (!isLive(reply)) return null;
    const messages = context.text ? withMeetingContext(reply, session.messages, context.text) : session.messages;

    streamingStore.start(reply.messageId);
    let streaming = false;
    /** The reply's first content (text, thinking or a tool call) switches it from loading to streaming. */
    const markStreaming = () => {
      if (streaming) return;
      streaming = true;
      store.setState({ aiActivity: null });
      patchMessage(reply.sessionId, reply.messageId, (m) => withMetadata(m, { state: 'streaming' }));
    };

    return orchestrate(
      {
        messages,
        sessionId: reply.sessionId,
        messageId: reply.messageId,
        model: resolved,
        prompt: {
          meetingCount: (await queryClient.fetchQuery(itemCountsQuery)).meetings,
          timeContext: formatChatTimeContext(),
          personalization: await chatPersonalization(settings),
        },
        settings,
        providers,
        signal,
        reasoningEffort: session.reasoningEffort ?? 'provider-default',
        extras: extrasWanted(request),
      },
      {
        onParts: (parts) => {
          // Until something shows (words, thinking, a tool), the header keeps saying what's under way.
          if (!isLive(reply) || !parts.some(isShownPart)) return;
          markStreaming();
          if (tally.firstTextAt === 0 && messageText({ parts })) tally.firstTextAt = Date.now();
          streamingStore.update(parts);
        },
        onProgress: (progress) => {
          if (isLive(reply)) store.setState({ aiActivity: progress });
        },
        onGeneration: (stats) => {
          if (isLive(reply)) streamingStore.setGeneration(stats);
        },
      },
    );
  }

  /** Runs one reply to its end: complete, failed, or (via Stop) settled elsewhere. Every outcome is saved once. */
  async function generateReply(reply: Reply, request: ReplyRequest): Promise<void> {
    const tally: StreamTally = { firstTextAt: 0 };
    try {
      const result = await streamReply(reply, request, tally);
      if (!result || !isLive(reply)) return; // Stop settled and saved it.

      logUsage({ category: 'chat', sessionId: reply.sessionId, provider: result.provider, model: result.model, usage: result.tokenUsage })
        .catch((e: unknown) => console.error('[UsageLog] chat:', e));

      streamingStore.finish();
      const { parts, tokenUsage: usage, context, extras } = result;
      saveSession(settle(reply.sessionId, reply.messageId, parts, { tokensPerSecond: tokensPerSecond(usage?.outputTokens, tally.firstTextAt), context, usage }));
      endReply(reply);
      notifyReply(reply.sessionId, messageText({ parts }));
      awaitingExtras.set(reply.sessionId, reply);
      const settledTitle = sessionOf(reply.sessionId)?.title;
      // Never rejects: a failed call logs and gives none.
      void extras.then((found) => applyExtras(reply, settledTitle, found));
    } catch (error: unknown) {
      if (!isLive(reply)) return; // Stopped: the abort surfaced as an error, and Stop already settled it.
      console.error('[ChatStore] Error sending message:', error);
      streamingStore.reset();
      // Offline is said as that (the device's report); otherwise the provider's own words, read by the error card.
      const text = offlineError(error)?.message ?? (errorMessage(error) || CHAT_ERROR_COPY.unknown);
      saveSession(settle(reply.sessionId, reply.messageId, [{ type: 'text', text }], { isError: true }));
      endReply(reply);
    }
  }

  /** The question's chat, now holding it, current and saved; null when there's nothing to send or its chat isn't loaded. */
  function postQuestion(textOverride: string | undefined): { session: ChatSession; question: Question; isNewSession: boolean } | null {
    const question = questionToSend(textOverride);
    if (!canSendDraft(question.text, question.attachments)) return null;
    const target = targetSessionFor(question);
    if (!target) {
      console.error('[ChatStore] sendMessage: session not loaded', store.getState().currentSessionId);
      return null;
    }
    const isNewSession = !store.getState().currentSessionId;
    const session: ChatSession = {
      ...target,
      messages: [...withoutSuggestions(target.messages), questionMessage(question)],
      lastMessageAt: Date.now(),
    };
    putSession(session);
    store.setState({
      currentSessionId: session.id,
      ...(textOverride === undefined && { input: '', pendingAttachments: [], selectedMeetingRefs: [] }),
      ...(isNewSession && { draftMeetingId: null, draftReasoningEffort: 'provider-default' as const }),
    });
    return { session, question, isNewSession };
  }

  /** Sends the composer's draft (or only `textOverride`) and generates its reply; with no usable model the reply is a notice. */
  async function send(textOverride?: string): Promise<void> {
    if (store.getState().replyingSessionId) return;
    const posted = postQuestion(textOverride);
    if (!posted) return;
    const { session, question, isNewSession } = posted;
    cancelExtras(session.id);
    const reply = beginReply(session.id);
    await store.getState().persistSession(session);
    if (!isLive(reply)) return;

    const { settings, providers } = injectedRefs;
    // A chat keeps the model of its first reply; a new chat takes the chat model setting.
    const locked = chatModelOf(session);
    const resolved = settings ? resolveChatModel(settings, providers || [], locked) : null;
    const answer: ChatMessage = { id: reply.messageId, role: 'assistant', parts: [], metadata: { createdAt: Date.now() } };
    if (!settings || !resolved) {
      const text = locked ? lockedModelGoneReply(locked) : NO_MODEL_REPLY;
      const notice: ChatMessage = { ...answer, parts: [{ type: 'text', text }], metadata: { createdAt: Date.now(), state: 'complete' } };
      const hinted: ChatSession = { ...session, messages: [...session.messages, notice] };
      putSession(hinted);
      saveSession(hinted);
      endReply(reply);
      return;
    }

    // The reply's placeholder lives in memory only; it is saved once it settles.
    putSession({
      ...session,
      messages: [...session.messages, withMetadata(answer, { provider: resolved.provider, model: resolved.modelId, state: 'loading' })],
    });
    await generateReply(reply, { session, question, resolved, settings, providers: providers || [], isNewSession });
  }

  /** Stops the reply in flight, wherever it is, keeping what it has written so far. */
  function stop(): void {
    const reply = activeReply;
    if (!reply) return;
    reply.controller.abort();
    const parts = streamingStore.finish();
    // A reply stopped before anything showed says so; one that showed work keeps just that.
    saveSession(settle(reply.sessionId, reply.messageId, parts.some(isShownPart) ? parts : [...parts, { type: 'text', text: STOPPED_REPLY }]));
    endReply(reply);
  }

  /** A reply is being generated in this chat. */
  const isReplyingIn = (sessionId: string): boolean => activeReply?.sessionId === sessionId;

  return { send, stop, isReplyingIn, cancelExtras };
}
