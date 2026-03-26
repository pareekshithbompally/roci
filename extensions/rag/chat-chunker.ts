/**
 * Chat Session Chunker
 *
 * Splits a chat session into indexable conversation turns.
 * Each turn = one user message + the assistant's response.
 * This is the semantic unit of a chat: a question and its answer.
 */

import type { ChatSession, ChatMessage } from '@/types';
import { MIN_TURN_LENGTH, MAX_ASSISTANT_CHUNK_CHARS } from './constants';

export interface ChatChunk {
  text: string;
  index: number;
  type: 'turn';
}

/**
 * Chunk a chat session into conversation turns for indexing.
 * Pairs each user message with the following assistant message.
 * Short turns (< MIN_TURN_LENGTH chars) are skipped.
 */
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
    const assistantText =
      nextMsg?.role === 'model'
        ? (nextMsg.text ?? '').slice(0, MAX_ASSISTANT_CHUNK_CHARS).trim()
        : '';

    const turnText = assistantText
      ? `User: ${userText}\nAssistant: ${assistantText}`
      : `User: ${userText}`;

    if (turnText.length >= MIN_TURN_LENGTH) {
      chunks.push({ text: turnText, index: chunks.length, type: 'turn' });
    }

    i += nextMsg?.role === 'model' ? 2 : 1;
  }

  return chunks;
}

/**
 * Compute a content hash for staleness detection.
 * Hash covers all message texts — any edit triggers re-indexing.
 */
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
