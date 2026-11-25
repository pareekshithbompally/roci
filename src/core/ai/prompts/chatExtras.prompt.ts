/** After a reply, one short structured call to the chat's own model names a new chat and/or suggests follow-ups; its
 *  output's shape is chatExtrasSchema(want). It reads only the user's last message and the reply, never tools. */

import { SUGGESTION_COUNT } from '@config/chat.config';
import { NO_PERSONALIZATION, templateText, type PromptPersonalization } from './personalization.prompt';

/** What the call after a reply asks for: a title (a new chat, while naming is on), follow-ups (while they're on). */
export interface ChatExtrasWant {
  title: boolean;
  suggestions: boolean;
}

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

/** The extras call's instructions: the rules for each field it asks for. */
export function chatExtrasInstructions(want: ChatExtrasWant, personalization: PromptPersonalization = NO_PERSONALIZATION): string {
  const titleRules = templateText(personalization, 'chatTitles', () => TITLE_RULES);
  const intro = 'You just answered the user\'s message below. Reply with only the fields asked for.';
  return [intro, want.title && titleRules, want.suggestions && SUGGESTION_RULES].filter(Boolean).join('\n\n');
}

/** The extras call's input: the user's last message and the reply's text. */
export function chatExtrasInput(question: string, answer: string): string {
  return `## The user's message\n\n${question}\n\n## Your answer\n\n${answer}`;
}
