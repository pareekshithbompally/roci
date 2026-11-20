/** Splits a chat session into indexable turns: one user message plus the assistant's reply; a long reply is split at
 *  sentences like a transcript, each piece with its question, so all of it is searchable. */

import type { ChatSession, ChatMessage } from '@shared/types';
import { MIN_TURN_LENGTH } from './constants';
import { splitAtSentences } from './chunker';

export interface ChatChunk {
  text: string;
  index: number;
  type: 'turn';
}

/** Pairs each user message with the next assistant message; turns under MIN_TURN_LENGTH are skipped. */
export function chunkChatSession(session: ChatSession): ChatChunk[] {
  const chunks: ChatChunk[] = [];
  const messages = session.messages;

  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role !== 'user') {
      i++;
      continue;
    }

    const userText = msg.text?.trim() ?? '';
    const nextMsg: ChatMessage | undefined = messages[i + 1];
    const reply = nextMsg?.role === 'model' ? splitAtSentences(nextMsg.text ?? '') : [];

    for (const piece of reply.length > 0 ? reply : ['']) {
      const turnText = piece ? `User: ${userText}\nAssistant: ${piece}` : `User: ${userText}`;
      if (turnText.length >= MIN_TURN_LENGTH) chunks.push({ text: turnText, index: chunks.length, type: 'turn' });
    }

    i += nextMsg?.role === 'model' ? 2 : 1;
  }

  return chunks;
}

/** Content hash over every message, so any edit triggers re-indexing. */
export async function computeChatHash(session: ChatSession): Promise<string> {
  const content = session.messages
    .map(m => `${m.role}:${m.text ?? ''}`)
    .join('\n');
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
