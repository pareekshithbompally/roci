import type { AudioCaptureSource } from './src/config/audio.config';
import type { MeetingCitation } from './extensions/tools/types';
import type { WebCitation, InlineCitationSpan } from './services/ai/types';
export type { MeetingCitation, WebCitation, InlineCitationSpan };

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  completed: boolean;
  reminder?: TodoReminder;
}

export interface Note {
  id: string;
  text: string;
  timestamp: number;
}

export interface StructuredSummary {
  overview?: string;
  keyDiscussionPoints?: string[];
  decisionsMade?: string[];
  actionItems?: ActionItem[];
  nextSteps?: string[];
  /** @deprecated Use overview instead */
  tldr?: string;
  /** @deprecated Use keyDiscussionPoints/decisionsMade/nextSteps instead */
  notes?: string;
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
  /** Calendar integration fields (populated when recording started from a calendar event) */
  calendarEventId?: string;
  scheduledTitle?: string;
  participants?: Array<{ name?: string; email?: string; status?: string }>;
  scheduledStart?: string;
  scheduledEnd?: string;
  meetingUrl?: string;
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
  | { type: 'document'; mimeType: string; source: MediaSource; fileName: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      status: 'calling' | 'complete' | 'error';
      result?: {
        content: string;
        isError: boolean;
        executionMs?: number;
      };
    };

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** Multimodal content parts (text, images, audio, video) */
  parts?: ChatPart[];
  /** Meeting references attached as context for this message */
  meetingRefs?: Array<{ id: string; title: string }>;
  timestamp: number;
  suggestions?: string[];
  provider?: string;
  model?: string;
  state?: 'loading' | 'streaming' | 'complete';
  isError?: boolean;
  /** Approximate output token count for this message */
  tokenCount?: number;
  /** Input (prompt) token count for this message */
  inputTokenCount?: number;
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
  /** Meeting citations gathered from tool calls */
  meetingCitations?: MeetingCitation[];
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
  meetingId?: string;
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
  /** Model used for KG entity extraction during rebuild. Falls back to chatModel if unset. */
  kgExtractionModel?: string;
  apiKey?: string;
  audioQualityPreset?: 'voice' | 'podcast' | 'music' | 'professional';
  defaultAudioSource?: AudioCaptureSource;
  categories?: string[];
  jobProcessing?: {
    mode: 'sequential' | 'parallel';
    maxConcurrent: number;
  };
  /** What the LLM should extract from transcriptions */
  summaryExtraction?: {
    keyDiscussionPoints: boolean;
    decisionsMade: boolean;
    actionItems: boolean;
    nextSteps: boolean;
  };
  /** Meeting behavior defaults */
  meetingDefaults?: {
    /** Auto-generate title from transcript content */
    autoTitle: boolean;
    /** Default meeting duration in minutes (for reminders) — 0 = no reminder */
    durationReminderMinutes: number;
  };
  /** macOS Calendar integration (EventKit) */
  calendarIntegration?: {
    enabled: boolean;
    /** Minutes before meeting start to show notification */
    notifyMinutesBefore: number;
  };
}

// ============ New Data Layer Types ============

/** Lightweight entry for sidebar listing — stored in meetings/index.json */
export interface MeetingIndexEntry {
  id: string;
  title: string;
  categories: string[];
  recordingFileName?: string;
  inputSource?: string;
  createdAt: string;
  updatedAt: string;
  pendingTranscription?: boolean;
  /** Calendar integration — populated when recording starts from a calendar notification */
  calendarEventId?: string;
  /** Original meeting title from the calendar (distinct from LLM-generated title) */
  scheduledTitle?: string;
  /** Participant list from calendar */
  participants?: Array<{ name?: string; email?: string; status?: string }>;
  /** Scheduled start time (ISO 8601) */
  scheduledStart?: string;
  /** Scheduled end time (ISO 8601) */
  scheduledEnd?: string;
  /** Extracted video call URL */
  meetingUrl?: string;
}

/** Structured summary — matches LLM JSON schema directly */
export interface MeetingSummary {
  overview: string;
  keyDiscussionPoints: string[];
  decisionsMade: string[];
  actionItems: { text: string; owner?: string; dueDate?: string }[];
  nextSteps: string[];
}

/** Per-meeting transcript — stored in meetings/{id}/transcript.json */
export interface TranscriptData {
  text: string;
  language?: string;
  model?: string;
  createdAt: string;
}

/** Per-meeting recording metadata — stored in meetings/{id}/recording.json */
export interface RecordingMeta {
  filename: string;
  duration?: number;
  inputSource?: string;
  createdAt: string;
}

/** Reminder attached to a todo — scheduled as an OS notification */
export interface TodoReminder {
  dateTime: string;          // ISO 8601 — exact time to fire
  notificationId: number;    // 32-bit int required by Tauri notification API
}

/** Todo with source tag — stored in meetings/{id}/todos.json */
export interface TodoEntry {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  completed: boolean;
  source: 'ai' | 'user';
  createdAt: string;
  reminder?: TodoReminder;
}

/** Entry in the global reminders.json index */
export interface ReminderEntry {
  todoId: string;
  meetingId: string;
  todoText: string;
  meetingTitle: string;
  reminderDateTime: string;  // ISO 8601
  notificationId: number;
  status: 'scheduled' | 'fired' | 'cancelled';
  createdAt: string;
}

/** Note — stored in meetings/{id}/notes.json */
export interface NoteEntry {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** Full meeting detail (lazy-loaded) */
export interface MeetingDetail {
  index: MeetingIndexEntry;
  transcript?: TranscriptData;
  summary?: MeetingSummary;
  recording?: RecordingMeta;
  notes: NoteEntry[];
  todos: TodoEntry[];
}

/** Chat index entry — stored in chats/index.json */
export interface ChatIndexEntry {
  id: string;
  title: string;
  lastMessageAt: number;
  messageCount?: number;  // written on save, displayed in sidebar
}

export const AVAILABLE_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
];
