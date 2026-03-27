/**
 * LLM-based Intent Classifier (Step 1)
 *
 * Single generateText() call with structured JSON output.
 * Classifies the user's intent and extracts retrieval parameters.
 * ~300-500ms with a fast model.
 */

import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { IntentClassification, IntentType } from './types';
import type { ChatMessage } from '@/types';
import { buildIntentClassifierPrompt } from '@core/ai/prompts/chat.prompt';

const VALID_INTENTS: IntentType[] = [
  'general',
  'meeting_search',
  'meeting_recall',
  'meeting_detail',
  'meeting_list',
  'action_items',
  'manage_todos',
  'relationship',
  'cross_meeting',
  'chat_recall',
  'catch_up',
];

export async function classifyIntent(params: {
  model: LanguageModel;
  messages: ChatMessage[];
  meetingCount: number;
  chatCount?: number;
  signal?: AbortSignal;
}): Promise<IntentClassification> {
  const { model, messages, meetingCount, chatCount = 0, signal } = params;

  // Fast path: no meetings and no chats → always general
  if (meetingCount === 0 && chatCount === 0) {
    return { intent: 'general', confidence: 'high', depth: 'none' };
  }

  const recentMessages = messages.slice(-6);
  const lastUserMessage = getLastUserMessage(recentMessages);

  // Ultra-short messages are always general
  if (lastUserMessage.length < 3) {
    return { intent: 'general', confidence: 'high', depth: 'none' };
  }

  try {
    const result = await generateText({
      model,
      system: buildIntentClassifierPrompt(),
      messages: [
        {
          role: 'user',
          content: buildClassifierInput(recentMessages, meetingCount, chatCount),
        },
      ],
      abortSignal: signal,
    });

    return parseClassifierOutput(result.text, lastUserMessage);
  } catch (error: unknown) {
    console.error('[IntentClassifier] Classification failed:', error);
    return fallbackClassification(lastUserMessage);
  }
}

function buildClassifierInput(
  messages: ChatMessage[],
  meetingCount: number,
  chatCount: number,
): string {
  const formatted = messages
    .map(
      (m) =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.slice(0, 300)}`,
    )
    .join('\n');

  return `Meeting count: ${meetingCount}
Chat session count: ${chatCount}
Today's date: ${new Date().toISOString().split('T')[0]} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })})

Recent conversation:
${formatted}

Classify the LAST user message.`;
}

function parseClassifierOutput(
  text: string,
  fallbackQuery: string,
): IntentClassification {
  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (!VALID_INTENTS.includes(parsed.intent)) {
      return fallbackClassification(fallbackQuery);
    }

    return {
      ...parsed,
      // Normalize: if LLM returns singular `mutation`, wrap it into `mutations` array
      mutations: parsed.mutations || (parsed.mutation ? [parsed.mutation] : undefined),
      depth: parsed.depth || depthForIntent(parsed.intent),
      search_query: parsed.search_query || undefined,
    };
  } catch {
    return fallbackClassification(fallbackQuery);
  }
}

function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].text;
    }
  }
  return '';
}

function fallbackClassification(query: string): IntentClassification {
  return {
    intent: 'meeting_recall',
    confidence: 'medium',
    search_query: query,
    depth: 'deep',
    max_meetings: 3,
  };
}

function depthForIntent(intent: IntentType): 'none' | 'surface' | 'deep' {
  switch (intent) {
    case 'general':
      return 'none';
    case 'meeting_search':
      return 'surface';
    case 'meeting_list':
      return 'none';
    case 'action_items':
      return 'surface';
    case 'manage_todos':
      return 'surface';
    case 'relationship':
      return 'surface';
    case 'chat_recall':
      return 'surface';
    default:
      return 'deep';
  }
}
