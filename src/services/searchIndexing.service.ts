import type {
  ActionItem,
  ChatSession,
  HistoryItem,
  MeetingDetail,
  Note,
} from '@shared/types';
import { meetingService } from '@services/meeting.service';
import { summaryMarkdown } from '@core/ai';
import { store } from '@services/db';
import { concurrencyMap } from '@shared/utils/async.utils';
import { IO_CONCURRENCY, MEETING_EDIT_SETTLE_MS } from '@extensions/rag/constants';

function mapNotes(detail: MeetingDetail): Note[] {
  return detail.notes.map((note) => ({
    id: note.id,
    text: note.text,
    timestamp: Date.parse(note.updatedAt || note.createdAt) || Date.now(),
  }));
}

function mapActionItems(detail: MeetingDetail): ActionItem[] {
  return detail.todos.map((todo) => ({
    id: todo.id,
    text: todo.text,
    owner: todo.owner,
    dueDate: todo.dueDate,
    completed: todo.completed,
  }));
}

function toHistoryItem(detail: MeetingDetail): HistoryItem {
  const inputSource =
    (detail.recording?.inputSource as HistoryItem['inputSource'] | undefined)
    ?? (detail.index.inputSource as HistoryItem['inputSource'] | undefined);

  return {
    id: detail.index.id,
    title: detail.index.title,
    categories: detail.index.categories,
    timestamp: Date.parse(detail.index.createdAt) || Date.now(),
    recordingFileName: detail.recording?.filename ?? detail.index.recordingFileName,
    inputSource,
    status: detail.index.status,
    transcript: detail.transcript?.text ?? '',
    summary: summaryMarkdown(detail.summary),
    structuredSummary: detail.summary ? {
      overview: detail.summary.overview,
      keyDiscussionPoints: detail.summary.keyDiscussionPoints,
      decisionsMade: detail.summary.decisionsMade,
      actionItems: detail.summary.actionItems.map((item) => ({
        id: crypto.randomUUID(),
        text: item.text,
        owner: item.owner,
        dueDate: item.dueDate,
        completed: false,
      })),
      nextSteps: detail.summary.nextSteps,
      enhancedNotes: detail.summary.enhancedNotes,
    } : undefined,
    userNotes: mapNotes(detail),
    userActionItems: mapActionItems(detail),
  };
}

async function loadMeetingsForIndexing(): Promise<HistoryItem[]> {
  const entries = await meetingService.listMeetings();
  const details = await concurrencyMap(
    entries,
    (entry) => meetingService.getMeetingDetail(entry.id),
    { limit: IO_CONCURRENCY },
  );

  return details
    .filter((detail): detail is MeetingDetail => detail !== null)
    .map(toHistoryItem);
}

async function loadChatsForIndexing(): Promise<ChatSession[]> {
  const result = await store.chats.list(500, 0);
  const sessions = await concurrencyMap(
    result.items,
    async (entry) => {
      try {
        return await store.chats.get(entry.id);
      } catch {
        return null;
      }
    },
    { limit: IO_CONCURRENCY },
  );
  return sessions.filter((s): s is ChatSession => s !== null);
}

/** Indexes every meeting, then every chat: full-text always, vectors when asked (needs the embedding model). */
async function indexAll(options: { includeEmbeddings: boolean; signal?: AbortSignal }): Promise<void> {
  const { ragIndexer, chatIndexer } = await import('@extensions/rag');
  const [meetings, chats] = await Promise.all([loadMeetingsForIndexing(), loadChatsForIndexing()]);
  await ragIndexer.indexAll(meetings, options);
  if (options.signal?.aborted) return;
  await chatIndexer.indexAllSessions(chats, options);
}

/** A finished (`ready`) meeting in full — transcript, summary, notes and to-dos — with vectors once the embedding
 *  model is downloaded; a meeting still recording or processing waits for its own finish. */
async function indexMeeting(meetingId: string): Promise<void> {
  const detail = await meetingService.getMeetingDetail(meetingId);
  if (detail?.index.status.status !== 'ready') return;
  const { ragIndexer, isEmbeddingAvailable } = await import('@extensions/rag');
  await ragIndexer.indexMeeting(toHistoryItem(detail), { includeEmbeddings: await isEmbeddingAvailable() });
}

/** One timer per meeting, re-armed by each edit. */
const settling = new Map<string, ReturnType<typeof setTimeout>>();

/** A meeting's notes or to-dos changed: index it once the edits settle. */
function meetingEdited(meetingId: string): void {
  clearTimeout(settling.get(meetingId));
  settling.set(meetingId, setTimeout(() => {
    settling.delete(meetingId);
    indexMeeting(meetingId).catch((error: unknown) =>
      console.error('[SearchIndexing] Re-indexing an edited meeting failed:', meetingId, error));
  }, MEETING_EDIT_SETTLE_MS));
}

export const searchIndexingService = {
  loadMeetingsForIndexing,
  loadChatsForIndexing,
  indexAll,
  indexMeeting,
  meetingEdited,
};
