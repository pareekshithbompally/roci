/** Names a new chat from its first exchange; the title comes back as the `title` field. */

export const CHAT_TITLE_PROMPT = `Name this conversation for a list of chats: 2 to 6 words naming its specific subject (a meeting, person, product, place or task), not the kind of request.

- "Q3 budget review", not "Question about the budget"; "Trip to Lisbon", not "Travel help".
- No filler words: Chat, Conversation, Question, Help, Discussion, Request.
- Sentence case, in the language the user writes in. No quotes, no emoji, no ending punctuation.`;
