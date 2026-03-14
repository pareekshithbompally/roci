import type { AudioCaptureSource } from './src/config/audio.config';
import type { MeetingCitation } from './extensions/tools/types';
import type { WebCitation, InlineCitationSpan } from './services/adapters/types';
export type { MeetingCitation, WebCitation, InlineCitationSpan };

export interface ActionItem {
  id: string;
  text: string;
  dueDate?: string;
  completed: boolean;
}

export interface Note {
  id: string;
  text: string;
  timestamp: number;
}

export interface StructuredSummary {
  tldr?: string;
  notes?: string;
  actionItems?: ActionItem[];
}

export interface ProcessedResult {
  title: string;
  transcript: string;
  summary: string;
  categories: string[];
  structuredSummary?: StructuredSummary;
  timestamp?: number;
  userNotes?: Note[];
  userActionItems?: ActionItem[];
}

export interface HistoryItem extends ProcessedResult {
  id: string;
  timestamp: number;
  title: string;
  recordingId?: string;
  recordingFileName?: string;
  transcriptionId?: string;
  summaryId?: string;
  inputSource?: AudioCaptureSource;
  pendingTranscription?: boolean;
}

/**
 * AppStatus represents VIEW state, not recording state.
 * Recording state is managed independently in RecordingContext.
 */
export enum AppStatus {
  IDLE = 'IDLE',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR',
  CHAT = 'CHAT'
}


export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

/** Source for media content in chat messages */
export type MediaSource =
  | { kind: 'url'; url: string }
  | { kind: 'data'; base64: string }
  | { kind: 'file'; path: string };

/** A single content part within a chat message */
export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; source: MediaSource; alt?: string }
  | { type: 'audio'; mimeType: string; source: MediaSource; durationMs?: number }
  | { type: 'video'; mimeType: string; source: MediaSource; alt?: string }
  | { type: 'document'; mimeType: string; source: MediaSource; fileName: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** Multimodal content parts (text, images, audio, video) */
  parts?: ChatPart[];
  timestamp: number;
  suggestions?: string[];
  provider?: string;
  model?: string;
  state?: 'loading' | 'streaming' | 'complete';
  /** Approximate token count for this message */
  tokenCount?: number;
  /** Tokens per second during streaming */
  tokensPerSecond?: number;
  /** Metadata about tool calls made during this response (persisted) */
  toolActivity?: {
    calls: Array<{
      toolName: string;
      executionMs: number;
      resultSummary?: string;
    }>;
    totalIterations: number;
    /** Citation cards gathered from search_meetings tool calls (UI-only) */
    citations?: MeetingCitation[];
  };
  /** Web search citations attached to this response */
  webCitations?: WebCitation[];
  /** Inline citation spans (char offsets → webCitations indices) */
  inlineCitations?: InlineCitationSpan[];
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: number;
  messages: ChatMessage[];
}

/**
 * Unified sidebar item - represents either a meeting (history item) or a chat session
 */
export interface UnifiedSidebarItem {
  id: string;
  type: 'meeting' | 'chat';
  title: string;
  timestamp: number;
  historyItem?: HistoryItem;
  chatSession?: ChatSession;
  matchContext?: string;
  matchType?: string;
}

export interface AppSettings {
  transcriptionModel: string;
  chatModel: string;
  apiKey?: string;
  audioQualityPreset?: 'voice' | 'podcast' | 'music' | 'professional';
  defaultAudioSource?: AudioCaptureSource;
  categories?: string[];
}

export const AVAILABLE_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
];
