import type {
  ActionItem,
  ChatSession,
  HistoryItem,
  MeetingDetail,
  MeetingSummary,
  Note,
} from '@/types';
import { meetingService } from '@/services/meeting.service';
import { chatSessionRepository } from '@/services/repositories/chat-session.repository';
import { concurrencyMap } from '@shared/utils/async.utils';
import { IO_CONCURRENCY } from '@extensions/rag/constants';

export function formatMeetingSummary(summary?: MeetingSummary): string {
  if (!summary) return '';

  const parts: string[] = [];
  if (summary.overview) parts.push(summary.overview);
  if (summary.keyDiscussionPoints.length > 0) {
    parts.push(`Key Discussion Points:\n${summary.keyDiscussionPoints.map(point => `- ${point}`).join('\n')}`);
  }
  if (summary.decisionsMade.length > 0) {
    parts.push(`Decisions Made:\n${summary.decisionsMade.map(decision => `- ${decision}`).join('\n')}`);
  }
  if (summary.actionItems.length > 0) {
    parts.push(
      `Action Items:\n${summary.actionItems.map((item) => {
        const owner = item.owner ? ` (${item.owner})` : '';
        const dueDate = item.dueDate ? ` — due ${item.dueDate}` : '';
        return `- ${item.text}${owner}${dueDate}`;
      }).join('\n')}`,
    );
  }
  if (summary.nextSteps.length > 0) {
    parts.push(`Next Steps:\n${summary.nextSteps.map(step => `- ${step}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

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
    pendingTranscription: detail.index.pendingTranscription,
    transcript: detail.transcript?.text ?? '',
    summary: formatMeetingSummary(detail.summary),
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
  const stored = await chatSessionRepository.loadAllSessions();
  return stored.map((session) => ({
    id: session.id,
    title: session.title,
    lastMessageAt: session.lastMessageAt,
    messages: session.messages,
  }));
}

export const searchIndexingService = {
  loadMeetingsForIndexing,
  loadChatsForIndexing,
};
