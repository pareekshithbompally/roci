import type { HistoryItem, ChatMessage, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import type { MeetingListItem } from '@/services/meetingReferenceService';

export interface ContextInput {
  userMessage: string;
  conversationMessages: ChatMessage[];
  historyItems: HistoryItem[];
  settings: AppSettings;
  providers: ModelProvider[];
  manualMeetingRefs: MeetingListItem[];
  signal?: AbortSignal;
}

export interface ContextOutput {
  text: string;
  provider: string;
  confidence: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

export interface ContextProvider {
  readonly name: string;
  readonly priority: number;
  shouldRun(input: ContextInput): boolean;
  resolve(input: ContextInput): Promise<ContextOutput>;
}
