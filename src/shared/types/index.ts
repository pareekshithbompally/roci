import type { AudioCaptureSource } from '@config/audio.config';
import type { MeetingCitation } from '@extensions/tools/types';
import type { WebCitation, InlineCitationSpan } from '@services/ai/types';
import type { ReadAloudEngine } from '@config/readAloud.config';
import type { MeetingStatus } from './meetingPhase';
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
  segments?: StoredTranscriptSegment[];
}

export interface HistoryItem extends ProcessedResult {
  id: string;
  timestamp: number;
  title: string;
  recordingId?: string;
  recordingFileName?: string;
  transcriptionId?: string;
  summaryId?: string;
  inputSource?: string;
  /** Where the meeting is in its pipeline; absent for items that never had one (e.g. drafts). */
  status?: MeetingStatus;
  /** Calendar integration fields (populated when recording started from a calendar event) */
  calendarEventId?: string;
  scheduledTitle?: string;
  participants?: Array<{ name?: string; email?: string; status?: string }>;
  scheduledStart?: string;
  scheduledEnd?: string;
  meetingUrl?: string;
}

/** View state, not recording state (recording lives in recordingStore and the meeting's status). */
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
  /** A file in the app's data folder, by its path inside it (`images/….png`); the folder itself can move (iOS app updates). */
  | { kind: 'file'; path: string };

/** A single content part within a chat message */
export type ChatPart =
  | { type: 'text'; text: string }
  /** The model's thinking before or between its answer, as the provider streamed it. */
  | { type: 'reasoning'; text: string }
  | { type: 'image'; mimeType: string; source: MediaSource; alt?: string }
  | { type: 'audio'; mimeType: string; source: MediaSource; durationMs?: number }
  | { type: 'video'; mimeType: string; source: MediaSource; alt?: string }
  | { type: 'document'; mimeType: string; source: MediaSource; fileName: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      /** MCP server that ran the tool; absent for built-in tools. */
      source?: string;
      arguments: Record<string, unknown>;
      status: 'calling' | 'complete' | 'error';
      result?: {
        content: string;
        isError: boolean;
        executionMs?: number;
      };
    };

/** A tool's row in a chat message: Roci's own tools, MCP tools, and providers' built-in ones (web search). */
export type ToolCallPart = Extract<ChatPart, { type: 'tool_call' }>;

/** An image in a chat message: an attachment, or one a tool made (saved under app data). */
export type ImagePart = Extract<ChatPart, { type: 'image' }>;

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
  /** Cached input tokens served from KV/prompt cache (subset of inputTokenCount) */
  cacheReadTokens?: number;
  /** Tokens written to cache for future reuse */
  cacheWriteTokens?: number;
  /** Tokens per second during streaming */
  tokensPerSecond?: number;
  /** Meeting citations gathered from tool calls */
  meetingCitations?: MeetingCitation[];
  /** Web search citations attached to this response */
  webCitations?: WebCitation[];
  /** Inline citation spans (char offsets → webCitations indices) */
  inlineCitations?: InlineCitationSpan[];
}

/** How hard a model thinks before answering, in the AI SDK's own `reasoning` levels: `provider-default` leaves it to the model, `none` turns it off. */
export type ReasoningEffort = 'provider-default' | 'none' | 'low' | 'medium' | 'high' | 'max';

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: number;
  messages: ChatMessage[];
  meetingId?: string;
  /** This chat's thinking level; absent means `provider-default`. */
  reasoningEffort?: ReasoningEffort;
}

/** Sidebar item: either a meeting (history item) or a chat session. */
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

export interface ChatToolPreferences {
  /** Built-in meeting & chat tools, switched as one group. */
  meetingTools: boolean;
  /** generate_image, offered while an image model is chosen in Settings › Default Models. */
  imageGeneration: boolean;
  /** The provider's own web search, offered when the chat model's provider has one. */
  webSearch: boolean;
  /** MCP tools switched off, as `mcpToolKey(server, tool)` keys. */
  disabledMcpTools: string[];
}

/** A kind of notification the user can switch off (Settings › Notifications). */
export type NotificationKind =
  | 'meetingReminders'
  | 'detectedCalls'
  | 'recordingReady'
  | 'hexImports'
  | 'modelDownloads'
  | 'chatReplies'
  | 'todoReminders';

export type NotificationSettings = Record<NotificationKind, boolean> & {
  /** Minutes before a calendar meeting its reminder shows. */
  meetingLeadMinutes: number;
};

export interface AppSettings {
  /** First-run flow (permissions, then AI setup) finished or skipped; Settings › General can run it again. */
  onboarding?: {
    completed: boolean;
  };
  /** Speech-to-text provider (`openai`, `groq`, `local:…`, `hex`, …); see transcription.config. */
  transcriptionProvider?: string;
  /** Speech model of that provider (e.g. `gpt-4o-transcribe`, a Hex model id). */
  transcriptionModel: string;
  /** Show Hugging Face org icons on local model rows (fetches from huggingface.co). Off by default. */
  showModelAvatars?: boolean;
  /** Minutes an unused on-device model stays loaded (0 = until Roci quits); unset = the default. */
  modelIdleMinutes?: number;
  /** Hide the per-call tool blocks in chat answers (shown by default). */
  hideToolCalls?: boolean;
  /** Settings › General › Capture: show dictation as it's spoken, with a speech model that streams. */
  liveTranscription?: boolean;
  chatModel: string;
  /** LLM model for the Analyze phase — produces the structured meeting summary (Overview tab). */
  analyzeModel?: string;
  /** Image model provider for chat's generate_image tool (`openai`, `gemini`); unset = chat can't make images. */
  imageProvider?: string;
  /** Image model of that provider (see imageGeneration.config). */
  imageModel?: string;
  apiKey?: string;
  defaultAudioSource?: AudioCaptureSource;
  /** Transcribe a recording as soon as it stops; off keeps it as "Not transcribed" until asked. */
  autoTranscribe?: boolean;
  jobProcessing?: {
    mode: 'sequential' | 'parallel';
    maxConcurrent: number;
  };
  /** Composer Tools picker — which tools chat may use. Global, saved. */
  chatTools?: ChatToolPreferences;
  /** macOS Calendar integration (EventKit) */
  calendarIntegration?: {
    enabled: boolean;
  };
  /** Settings › Notifications: which kinds may notify, and the meeting lead time. */
  notifications?: NotificationSettings;
  /** Settings › Default Models › Read aloud: the engine replies are spoken with. */
  readAloudEngine?: ReadAloudEngine;
  /** The voice within `readAloudEngine` (its id from the engine's voice list); unset = the engine's default. */
  readAloudVoice?: string;
  /** Apple Intelligence integration: on-device chat and summary model + Apple speech engine */
  appleIntelligenceIntegration?: {
    enabled: boolean;
  };
  /** Apple Notes integration: each meeting's summary + transcript as a note */
  appleNotesIntegration?: {
    enabled: boolean;
    /** Epoch ms it was turned on; meetings from before aren't sent. */
    since?: number;
  };
  /** Spotlight integration: meetings searchable from macOS Spotlight */
  spotlightIntegration?: {
    enabled: boolean;
  };
  /** Hex integration: Hex's transcription models + one-way meeting sync */
  hexIntegration?: {
    enabled: boolean;
  };
  /** macOS Reminders integration (EventKit): action items ↔ a reminders list */
  remindersIntegration?: {
    enabled: boolean;
    /** EventKit list id; the "Roci" list is created on first enable */
    listId?: string;
  };
}

// ============ New Data Layer Types ============

/** Lightweight entry for sidebar listing — stored in roci.db meetings table */
export interface MeetingIndexEntry {
  id: string;
  title: string;
  categories: string[];
  recordingFileName?: string;
  inputSource?: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
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

/** Segment with timing metadata — persisted alongside transcript text */
export interface StoredTranscriptSegment {
  text: string;
  startSecond: number;
  endSecond: number;
  speaker?: string;
}

/** Per-meeting transcript — stored in meetings/{id}/transcript.json */
export interface TranscriptData {
  text: string;
  language?: string;
  model?: string;
  createdAt: string;
  segments?: StoredTranscriptSegment[];
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

/** Entry in the reminders table (joined to todos + meetings) */
export interface ReminderEntry {
  todoId: string;
  /** The to-do's meeting and its title; null for a to-do of its own. */
  meetingId: string | null;
  todoText: string;
  meetingTitle: string | null;
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

/** Chat index entry — stored in roci.db chats table */
export interface ChatIndexEntry {
  id: string;
  title: string;
  lastMessageAt: number;
  messageCount?: number;  // written on save, displayed in sidebar
}
