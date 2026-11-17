/** Shared store-client internals: the `call()` invoke helper, Rust row shapes, and row → domain mappers. */

import { invoke } from '@tauri-apps/api/core';
import { parseStoreError } from './errors';
import type {
  ChatMessage,
  NoteEntry,
  TodoEntry,
  ActionItem,
  ReminderEntry,
  MeetingIndexEntry,
} from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingStatus } from '@shared/types/meetingPhase';

const PLUGIN = 'plugin:store|';

let storeInitPromise: Promise<void> | null = null;

function ensureStoreInitialized(): Promise<void> {
  if (!storeInitPromise) {
    console.log('[store] Initializing database...');
    storeInitPromise = invoke('plugin:store|initialize').then(
      () => {
        console.log('[store] Database initialized successfully');
      },
      (err) => {
        console.error('[store] Database initialization FAILED:', err);
        storeInitPromise = null;
        throw err;
      },
    );
  }
  return storeInitPromise;
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    await ensureStoreInitialized();
    const result = await invoke<T>(`${PLUGIN}${command}`, args);
    return result;
  } catch (error: unknown) {
    console.error(`[store] Command '${command}' failed:`, error);
    throw parseStoreError(error);
  }
}

/** Extract the JSON data blob fields from a ChatMessage */
export function extractDataBlob(msg: ChatMessage): Record<string, unknown> | undefined {
  const data: Record<string, unknown> = {};
  if (msg.parts !== undefined) data.parts = msg.parts;
  if (msg.meetingRefs !== undefined) data.meetingRefs = msg.meetingRefs;
  if (msg.suggestions !== undefined) data.suggestions = msg.suggestions;
  if (msg.meetingCitations !== undefined) data.meetingCitations = msg.meetingCitations;
  if (msg.webCitations !== undefined) data.webCitations = msg.webCitations;
  if (msg.inlineCitations !== undefined) data.inlineCitations = msg.inlineCitations;
  if (msg.tokenCount !== undefined) data.tokenCount = msg.tokenCount;
  if (msg.inputTokenCount !== undefined) data.inputTokenCount = msg.inputTokenCount;
  if (msg.cacheReadTokens !== undefined) data.cacheReadTokens = msg.cacheReadTokens;
  if (msg.cacheWriteTokens !== undefined) data.cacheWriteTokens = msg.cacheWriteTokens;
  if (msg.tokensPerSecond !== undefined) data.tokensPerSecond = msg.tokensPerSecond;
  if (msg.state !== undefined) data.state = msg.state;
  if (msg.isError !== undefined) data.isError = msg.isError;
  return Object.keys(data).length > 0 ? data : undefined;
}

/** Reconstitute a ChatMessage from a Rust row */
export function rowToMessage(row: {
  id: string;
  seq: number;
  role: string;
  text: string;
  provider: string | null;
  model: string | null;
  data: string | null;
  created_at: number;
}): ChatMessage {
  const parsed = row.data ? JSON.parse(row.data) : {};
  return {
    id: row.id,
    role: row.role as 'user' | 'model',
    text: row.text,
    timestamp: row.created_at,
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...parsed,
  };
}

// ── Rust row type helpers ──

export interface RustNoteRow {
  id: string;
  text: string;
  created_at: number;
  updated_at: number;
}

export interface RustTodoRow {
  id: string;
  /** Null for a to-do of its own (not from a meeting); its title is null then too. */
  meeting_id: string | null;
  meeting_title: string | null;
  text: string;
  owner: string | null;
  due_date: string | null;
  completed: boolean;
  source: string;
  created_at: number;
  reminder: RustReminderRow | null;
}

export interface RustTodoListResult {
  items: RustTodoRow[];
  total: number;
}

/** A to-do with the meeting it came from; both null for a to-do of its own. */
export interface GlobalTodoEntry extends TodoEntry {
  meetingId: string | null;
  meetingTitle: string | null;
}

export interface RustReminderRow {
  notification_id: number;
  fire_at: number;
  status: string;
  created_at: number;
}

export interface RustReminderDueItem {
  todo_id: string;
  meeting_id: string | null;
  todo_text: string;
  meeting_title: string | null;
  fire_at: number;
  notification_id: number;
}

export interface RustSettingsEntry {
  key: string;
  value: string;
}

export interface RustProviderRow {
  provider: string;
  active: boolean;
  api_key_encrypted: string | null;
  base_url: string | null;
  data: string | null;
  updated_at: number;
}

export interface RustCategoryRow {
  id: string;
  name: string;
  created_at: number;
}

// ── Conversion helpers ──

export function rustNoteToEntry(row: RustNoteRow): NoteEntry {
  return {
    id: row.id,
    text: row.text,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function rustTodoToEntry(row: RustTodoRow): TodoEntry {
  const entry: TodoEntry = {
    id: row.id,
    text: row.text,
    completed: row.completed,
    source: row.source as 'ai' | 'user',
    createdAt: new Date(row.created_at).toISOString(),
  };
  if (row.owner) entry.owner = row.owner;
  if (row.due_date) entry.dueDate = row.due_date;
  if (row.reminder) {
    entry.reminder = {
      dateTime: new Date(row.reminder.fire_at).toISOString(),
      notificationId: row.reminder.notification_id,
    };
  }
  return entry;
}

export function rustTodoToActionItem(row: RustTodoRow): ActionItem {
  const item: ActionItem = {
    id: row.id,
    text: row.text,
    completed: row.completed,
  };
  if (row.owner) item.owner = row.owner;
  if (row.due_date) item.dueDate = row.due_date;
  if (row.reminder) {
    item.reminder = {
      dateTime: new Date(row.reminder.fire_at).toISOString(),
      notificationId: row.reminder.notification_id,
    };
  }
  return item;
}

export function rustTodoToGlobalEntry(row: RustTodoRow): GlobalTodoEntry {
  return { ...rustTodoToEntry(row), meetingId: row.meeting_id, meetingTitle: row.meeting_title };
}

export function rustReminderDueToEntry(row: RustReminderDueItem): ReminderEntry {
  return {
    todoId: row.todo_id,
    meetingId: row.meeting_id,
    todoText: row.todo_text,
    meetingTitle: row.meeting_title,
    reminderDateTime: new Date(row.fire_at).toISOString(),
    notificationId: row.notification_id,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
}

export function rustProviderToModelProvider(row: RustProviderRow): ModelProvider {
  const data = row.data ? JSON.parse(row.data) : {};
  return {
    provider: row.provider,
    active: row.active,
    api_key: row.api_key_encrypted ?? undefined,
    base_url: row.base_url ?? undefined,
    settings: data.settings ?? [],
    models: data.models ?? [],
    explore_models_url: data.explore_models_url,
    persist: data.persist,
    custom_header: data.custom_header ?? null,
  };
}

export function modelProviderToRust(provider: ModelProvider): {
  provider: string;
  active: boolean;
  api_key_encrypted: string | null;
  base_url: string | null;
  data: string | null;
} {
  const data: Record<string, unknown> = {
    settings: provider.settings ?? [],
    models: provider.models ?? [],
  };
  if (provider.explore_models_url) data.explore_models_url = provider.explore_models_url;
  if (provider.persist !== undefined) data.persist = provider.persist;
  if (provider.custom_header) data.custom_header = provider.custom_header;

  return {
    provider: provider.provider,
    active: provider.active,
    api_key_encrypted: provider.api_key ?? null,
    base_url: provider.base_url ?? null,
    data: JSON.stringify(data),
  };
}

/** The status columns every meeting row carries. */
export interface RustMeetingStatus {
  status: MeetingStatus['status'];
  failed_step: MeetingStatus['failedStep'] | null;
  error: string | null;
}

export function toMeetingStatus(row: RustMeetingStatus): MeetingStatus {
  const status: MeetingStatus = { status: row.status };
  if (row.failed_step) status.failedStep = row.failed_step;
  if (row.error) status.error = row.error;
  return status;
}

export interface RustMeetingRow extends RustMeetingStatus {
  id: string;
  title: string;
  input_source: string | null;
  calendar_event_id: string | null;
  calendar_meta: string | null;
  created_at: number;
  updated_at: number;
  categories: string[];
  recording_filename: string | null;
}

export function toMeetingIndexEntry(row: RustMeetingRow): MeetingIndexEntry {
  const entry: MeetingIndexEntry = {
    id: row.id,
    title: row.title,
    categories: row.categories,
    recordingFileName: row.recording_filename ?? undefined,
    inputSource: (row.input_source ?? undefined) as MeetingIndexEntry['inputSource'],
    status: toMeetingStatus(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  if (row.calendar_event_id) {
    entry.calendarEventId = row.calendar_event_id;
  }

  if (row.calendar_meta) {
    try {
      const cm = JSON.parse(row.calendar_meta);
      if (cm.scheduledTitle) entry.scheduledTitle = cm.scheduledTitle;
      if (cm.participants) entry.participants = cm.participants;
      if (cm.scheduledStart) entry.scheduledStart = cm.scheduledStart;
      if (cm.scheduledEnd) entry.scheduledEnd = cm.scheduledEnd;
      if (cm.meetingUrl) entry.meetingUrl = cm.meetingUrl;
    } catch { /* ignore malformed JSON */ }
  }

  return entry;
}
