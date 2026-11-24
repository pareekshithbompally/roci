/** A chat reply ends with one finishReply call that names a new chat and/or suggests follow-ups; its input's shape is
 *  chatExtrasSchema(want). The call is part of the reply itself, so nothing is sent a second time. */

import { SUGGESTION_COUNT } from '@config/chat.config';
import { NO_PERSONALIZATION, templateText, type PromptPersonalization } from './personalization.prompt';

/** What a reply's finishReply carries: a title (a new chat, while naming is on), follow-ups (while they're on). */
export interface ChatExtrasWant {
  title: boolean;
  suggestions: boolean;
}

export const FINISH_REPLY_TOOL = 'finishReply';

/** The one line the chat instructions add while finishReply is sent. */
export const FINISH_REPLY_RULE = `After your full answer, end the reply by calling ${FINISH_REPLY_TOOL} once. Never call it before or instead of answering.`;

/** How a chat is named: the Chat Titles template's default. */
export const TITLE_RULES = `"title" names this conversation for a list of chats: 2 to 6 words naming its specific subject (a meeting, person, product, place or task), not the kind of request.
- "Q3 budget review", not "Question about the budget"; "Trip to Lisbon", not "Travel help".
- No filler words: Chat, Conversation, Question, Help, Discussion, Request.
- Sentence case, in the language the user writes in. No quotes, no emoji, no ending punctuation.`;

const SUGGESTION_RULES = `"suggestions" holds ${SUGGESTION_COUNT} short follow-ups the user might send next.
- Written as the user would type it: "Make it shorter", not "Would you like me to make it shorter?"
- Only what you can do here with your tools; never an action in the outside world (booking, buying, sending, calling).
- If your answer asked the user a question, suggest short answers to it.
- Different from each other and new: not a rewording of the question or something you already covered.
- Each under 12 words, in the language the user writes in.`;

/** finishReply's description: the rules for each field it asks for (when to call it is FINISH_REPLY_RULE, in the chat's
 *  instructions). */
export function finishReplyDescription(want: ChatExtrasWant, personalization: PromptPersonalization = NO_PERSONALIZATION): string {
  const titleRules = templateText(personalization, 'chatTitles', () => TITLE_RULES);
  return ['Ends your reply.', want.title && titleRules, want.suggestions && SUGGESTION_RULES].filter(Boolean).join('\n\n');
}
