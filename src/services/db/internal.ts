/** Shared store-client internals: the `call()` invoke helper, Rust row shapes, and row → domain mappers. */

import { invoke } from '@tauri-apps/api/core';
import { parseStoreError } from './errors';
import type {
  ChatIndexEntry,
  ChatMessage,
  NoteEntry,
  TodoEntry,
  ReminderEntry,
  MeetingIndexEntry,
} from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingStatus } from '@shared/types/meetingPhase';
import type {
  MeetingRow,
  MeetingStatusRow,
  NoteRow,
  ReminderDueItem,
  TodoRow,
  TodoWithReminder,
} from '@shared/types/native';

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

/** A message row as the store returns it. */
export interface ChatMessageRow {
  id: string;
  seq: number;
  role: string;
  text: string;
  provider: string | null;
  model: string | null;
  data: string | null;
  created_at: number;
}

/** The store's own role words (`model` for a reply) ⇄ the AI SDK's. */
export const toRowRole = (role: ChatMessage['role']): string => (role === 'assistant' ? 'model' : role);
const fromRowRole = (role: string): ChatMessage['role'] => (role === 'model' ? 'assistant' : 'user');

/** A message from its row: its parts and metadata are the row's `data`, saved whole. */
export function rowToMessage(row: ChatMessageRow): ChatMessage {
  const { parts, metadata } = JSON.parse(row.data ?? '{}') as Pick<ChatMessage, 'parts' | 'metadata'>;
  return { id: row.id, role: fromRowRole(row.role), parts, metadata };
}

// ── Rust row type helpers ──

/** A to-do with the meeting it came from; both null for a to-do of its own. */
export interface GlobalTodoEntry extends TodoEntry {
  meetingId: string | null;
  meetingTitle: string | null;
  /** When its meeting was made (epoch ms); null for a to-do of its own. */
  meetingCreatedAt: number | null;
}

export interface RustSettingsEntry {
  key: string;
  value: string;
}

export interface RustProviderRow {
  provider: string;
  active: boolean;
  api_key: string | null;
  base_url: string | null;
  data: string | null;
  updated_at: number;
}

// ── Conversion helpers ──

export function rustNoteToEntry(row: NoteRow): NoteEntry {
  return {
    id: row.id,
    text: row.text,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** A meeting's to-do rows carry no reminder; the to-do domain's rows do. */
export function rustTodoToEntry(row: TodoRow & Partial<Pick<TodoWithReminder, 'reminder'>>): TodoEntry {
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

export function rustTodoToGlobalEntry(row: TodoWithReminder): GlobalTodoEntry {
  return { ...rustTodoToEntry(row), meetingId: row.meeting_id, meetingTitle: row.meeting_title, meetingCreatedAt: row.meeting_created_at };
}

export function rustReminderDueToEntry(row: ReminderDueItem): ReminderEntry {
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
    api_key: row.api_key ?? undefined,
    base_url: row.base_url ?? undefined,
    settings: data.settings ?? [],
    models: data.models ?? [],
    explore_models_url: data.explore_models_url,
    persist: data.persist,
    custom_header: data.custom_header ?? null,
    server_app: data.server_app,
    connection_check: data.connection_check,
  };
}

export function modelProviderToRust(provider: ModelProvider): {
  provider: string;
  active: boolean;
  api_key: string | null;
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
  if (provider.server_app) data.server_app = provider.server_app;
  if (provider.connection_check) data.connection_check = provider.connection_check;

  return {
    provider: provider.provider,
    active: provider.active,
    api_key: provider.api_key ?? null,
    base_url: provider.base_url ?? null,
    data: JSON.stringify(data),
  };
}

/** The status columns every meeting row carries; Rust stores them as plain strings it alone writes. */
export function toMeetingStatus(row: MeetingStatusRow): MeetingStatus {
  const status: MeetingStatus = { status: row.status as MeetingStatus['status'] };
  if (row.failed_step) status.failedStep = row.failed_step as NonNullable<MeetingStatus['failedStep']>;
  if (row.error) status.error = row.error;
  return status;
}

/** A chat list row as Rust sends it (no messages). */
export interface ChatIndexRow {
  id: string;
  title: string;
  last_message_at: number;
  message_count: number;
}

export const toChatIndexEntry = (row: ChatIndexRow): ChatIndexEntry => ({
  id: row.id,
  title: row.title,
  lastMessageAt: row.last_message_at,
  messageCount: row.message_count,
});

export function toMeetingIndexEntry(row: MeetingRow): MeetingIndexEntry {
  const entry: MeetingIndexEntry = {
    id: row.id,
    title: row.title,
    categories: row.categories,
    recordingFileName: row.recording_filename ?? undefined,
    audioRemovedAt: row.audio_removed_at ?? undefined,
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
