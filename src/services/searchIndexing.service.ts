import type {
  ActionItem,
  ChatSession,
  HistoryItem,
  MeetingDetail,
  Note,
} from '@shared/types';
import { meetingService } from '@services/meeting.service';
import { summaryMarkdown } from '@core/ai';
import { store, type ItemCursor, type ItemKind } from '@services/db';
import { concurrencyMap } from '@shared/utils/async.utils';
import { INDEX_PAGE_SIZE, IO_CONCURRENCY, MEETING_EDIT_SETTLE_MS } from '@extensions/rag/constants';

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

/** Every id of one kind, read from the store a page at a time (only for a full rebuild or the embedding catch-up). */
async function everyId(kind: ItemKind): Promise<string[]> {
  const ids: string[] = [];
  let before: ItemCursor | null = null;
  for (;;) {
    const page = await store.items.page(before, INDEX_PAGE_SIZE, { kind });
    for (const item of page) {
      const at = item.kind === 'meeting' ? new Date(item.meeting.createdAt).getTime() : item.chat.lastMessageAt;
      const id = item.kind === 'meeting' ? item.meeting.id : item.chat.id;
      ids.push(id);
      before = { at, id };
    }
    if (page.length < INDEX_PAGE_SIZE) return ids;
  }
}

async function loadMeetingsForIndexing(): Promise<HistoryItem[]> {
  const details = await concurrencyMap(
    await everyId('meeting'),
    (id) => meetingService.getMeetingDetail(id),
    { limit: IO_CONCURRENCY },
  );

  return details
    .filter((detail): detail is MeetingDetail => detail !== null)
    .map(toHistoryItem);
}

async function loadChatsForIndexing(): Promise<ChatSession[]> {
  const sessions = await concurrencyMap(
    await everyId('chat'),
    async (id) => {
      try {
        return await store.chats.get(id);
      } catch {
        return null;
      }
    },
    { limit: IO_CONCURRENCY },
  );
  return sessions.filter((s): s is ChatSession => s !== null);
}

/** Rebuilds the whole index (Settings › Search Index): every meeting, then every chat; `force` redoes up-to-date ones too. */
async function indexAll(options: { includeEmbeddings: boolean; force?: boolean; signal?: AbortSignal }): Promise<void> {
  const { ragIndexer, chatIndexer } = await import('@extensions/rag');
  const [meetings, chats] = await Promise.all([loadMeetingsForIndexing(), loadChatsForIndexing()]);
  await ragIndexer.indexAll(meetings, options);
  if (options.signal?.aborted) return;
  await chatIndexer.indexAllSessions(chats, options);
}

/** Meetings and chats without vectors, once the embedding model is installed: their ids are checked against the index, and only
 *  those that need it are loaded and embedded (everything else is indexed as it's saved). */
async function embedPending(signal?: AbortSignal): Promise<void> {
  const { ragIndexer, chatIndexer, vectorDB } = await import('@extensions/rag');
  const [meetingIds, chatIds] = await Promise.all([everyId('meeting'), everyId('chat')]);
  const [meetingsDue, chatsDue] = await Promise.all([
    vectorDB.getMeetingsNeedingEmbeddings(meetingIds),
    vectorDB.getChatsNeedingEmbeddings(chatIds),
  ]);
  const meetings = await concurrencyMap(meetingsDue, (id) => meetingService.getMeetingDetail(id), { limit: IO_CONCURRENCY, signal });
  await ragIndexer.indexAll(meetings.filter((d): d is MeetingDetail => d !== null).map(toHistoryItem), { includeEmbeddings: true, signal });
  if (signal?.aborted) return;
  const chats = await concurrencyMap(chatsDue, (id) => store.chats.get(id), { limit: IO_CONCURRENCY, signal });
  await chatIndexer.indexAllSessions(chats.filter((s): s is ChatSession => s !== null), { includeEmbeddings: true, signal });
}

/** A meeting in full — transcript, summary, notes and to-dos — with vectors once the embedding model is downloaded; one
 *  still waiting for its transcript is left as it is (the indexer's one rule, `isIndexable`). */
async function indexMeeting(meetingId: string): Promise<void> {
  const detail = await meetingService.getMeetingDetail(meetingId);
  if (!detail) return;
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
  embedPending,
  indexMeeting,
  meetingEdited,
};
