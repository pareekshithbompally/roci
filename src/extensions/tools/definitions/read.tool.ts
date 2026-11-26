/** read: one meeting (chosen parts: summary, notes, to-dos with their ids, transcript), one earlier chat (its latest messages
 *  when long), one document (its pages, the first ones when long) or one entity (what the user approved about it, its relations, the meetings that discussed it), by the id
 *  `find` returned; read from roci.db as it is now, and a meeting being recorded reads its transcript so far. */

import { z } from 'zod';
import type { DocumentCitation, MeetingCitation, ToolResult } from '@extensions/tools/types';
import { defineTool, fail, idFrom, ok, toolDate } from '@extensions/tools/contract';
import { meetingNotFound, todoLine } from '@extensions/tools/data';
import { MAX_CHAT_MESSAGES_FOR_LLM, MAX_CITATION_EXCERPT_CHARS, MAX_DOCUMENT_FOR_LLM, MAX_TRANSCRIPT_FOR_LLM } from '@extensions/tools/constants';
import { documentPages } from '@extensions/rag/searchIndex';
import { store } from '@services/db';
import { chatService } from '@services/chat.service';
import { summaryText } from '@services/meetingReferenceService';
import { excerptTranscript } from '@services/ai/transcription/excerpt';
import { messageText } from '@shared/utils/chatParts';
// the live store alone: importing the whole recording feature here makes an import cycle through the tool registry
import { runningTranscript } from '@features/recording/live/meetingLiveStore';
import type { MeetingDetail } from '@shared/types';

const PARTS = ['summary', 'notes', 'todos', 'transcript'] as const;
type Part = (typeof PARTS)[number];

/** Longest message text read back from a chat. */
const MESSAGE_CHARS = 800;

const input = z.object({
  meeting_id: idFrom('find in meetings', 'The meeting to read.').optional(),
  chat_id: idFrom('find in chats', 'The chat to read.').optional(),
  entity_id: idFrom('find in knowledge', 'The person, project or topic to read.').optional(),
  document_id: idFrom('find in documents or the attached file\'s note', 'The document to read.').optional(),
  parts: z
    .array(z.enum(PARTS))
    .min(1)
    .default(['summary', 'notes', 'todos'])
    .describe('Meeting only: which parts to read. The transcript is long: ask for it only when the summary is not enough.'),
});

// ── Meeting ──

const SECTIONS: Record<Part, (detail: MeetingDetail) => string | null> = {
  summary: (d) => (d.summary ? `### Summary\n${summaryText(d.summary)}` : null),
  notes: (d) => (d.notes.length > 0 ? `### Notes\n${d.notes.map((n) => `- ${n.text}`).join('\n')}` : null),
  todos: (d) => (d.todos.length > 0 ? `### To-dos\n${d.todos.map(todoLine).join('\n')}` : null),
  transcript: (d) => {
    const text = d.transcript?.text || runningTranscript(d.index.id);
    return text ? `### Transcript\n${excerptTranscript(text, MAX_TRANSCRIPT_FOR_LLM)}` : null;
  },
};

async function readMeeting(id: string, parts: Part[]): Promise<ToolResult> {
  const detail = await store.meetings.get(id);
  if (!detail) return meetingNotFound(id);
  const timestamp = Date.parse(detail.index.createdAt);
  const sections = [...new Set(parts)].map((part) => SECTIONS[part](detail)).filter((s): s is string => s !== null);
  const header = `## Meeting: ${detail.index.title}\n${toolDate(timestamp)} — ID: ${detail.index.id}`;
  const body = sections.length > 0 ? sections.join('\n\n') : `This meeting has no ${parts.join(' or ')} yet.`;
  // An explicit read: the meeting is a source of the answer.
  const citation: MeetingCitation = { meetingId: detail.index.id, meetingTitle: detail.index.title, meetingTimestamp: timestamp, excerpt: body.slice(0, MAX_CITATION_EXCERPT_CHARS), score: 1 };
  return ok(`${header}\n\n${body}`, { resultCount: 1, citations: [citation] });
}

// ── Chat ──

async function readChat(id: string): Promise<ToolResult> {
  const session = await chatService.loadSession(id);
  if (!session) return fail(`No chat has the ID "${id}". Get chat IDs from find in chats.`);
  // The most recent messages, to stay within the model's context.
  const total = session.messages.length;
  const messages = total > MAX_CHAT_MESSAGES_FOR_LLM ? session.messages.slice(-MAX_CHAT_MESSAGES_FOR_LLM) : session.messages;
  const lines = [
    `Chat: "${session.title}"`,
    `Date: ${toolDate(session.lastMessageAt)}`,
    `Messages: ${total}`,
    total > MAX_CHAT_MESSAGES_FOR_LLM ? `(showing last ${MAX_CHAT_MESSAGES_FOR_LLM} of ${total} messages)\n` : '',
    '--- Conversation ---',
  ];
  for (const message of messages) {
    const full = messageText(message);
    if (!full.trim()) continue;
    const said = full.length > MESSAGE_CHARS ? `${full.slice(0, MESSAGE_CHARS)}...[truncated]` : full;
    lines.push(`${message.role === 'user' ? 'User' : 'Assistant'}: ${said}`, '');
  }
  return ok(lines.join('\n'), { resultCount: 1 });
}

// ── Document ──

/** The pages that fit in `budget` characters, each under its number (a text file is one page), and how many were left out. */
function pagesWithin(pages: string[], budget: number): { text: string; left: number } {
  const sections: string[] = [];
  let used = 0;
  for (const [i, page] of pages.entries()) {
    const section = pages.length > 1 ? `### Page ${i + 1}\n${page.trim()}` : page.trim();
    if (sections.length > 0 && used + section.length > budget) return { text: sections.join('\n\n'), left: pages.length - i };
    sections.push(section.slice(0, budget));
    used += section.length;
  }
  return { text: sections.join('\n\n'), left: 0 };
}

async function readDocument(path: string): Promise<ToolResult> {
  const document = await documentPages(path).catch((error: unknown) => {
    console.warn('[read] Document not read:', path, error);
    return null;
  });
  if (!document) return fail(`No document can be read at "${path}". Get document IDs from find in documents.`);
  const { text, left } = pagesWithin(document.pages, MAX_DOCUMENT_FOR_LLM);
  const more = left > 0 ? `\n\n(${left} more page(s) not shown: look things up in them with find in documents, document "${path}".)` : '';
  const header = `## Document: ${document.name}${document.pages.length > 1 ? ` — ${document.pages.length} pages` : ''} — ID: ${path}`;
  // An explicit read: the document is a source of the answer.
  const citation: DocumentCitation = { path, name: document.name, page: null, excerpt: text.slice(0, MAX_CITATION_EXCERPT_CHARS), score: 1, kept: document.kept };
  return ok(`${header}\n\n${text || 'It has no text (a scan?).'}${more}`, { resultCount: 1, documentCitations: [citation] });
}

// ── Entity ──

async function readEntity(id: string): Promise<ToolResult> {
  const detail = await store.knowledge.entity(id);
  if (!detail) return fail(`Nothing known has the ID "${id}". Get IDs from find in knowledge.`);
  const { entity, facts, relations, meetings } = detail;
  const titleOf = (meetingId: string) => meetings.find((m) => m.id === meetingId)?.title ?? 'a meeting';
  const sections = [
    `## ${entity.name} (${entity.entity_type}) — discussed in ${entity.meetings} meeting(s) — ID: ${entity.id}`,
    facts.length > 0 && `### What the user approved about it\n${facts.map((f) => `- ${f}`).join('\n')}`,
    relations.length > 0 &&
      `### Relations\n${relations
        .map((r) => `- ${r.outgoing ? `${entity.name} ${r.relation} ${r.other}` : `${r.other} ${r.relation} ${entity.name}`} (from "${titleOf(r.meeting_id)}")`)
        .join('\n')}`,
    meetings.length > 0 && `### Meetings, newest first\n${meetings.map((m) => `- "${m.title}" — ${toolDate(m.created_at)} — ID: ${m.id}`).join('\n')}`,
  ];
  return ok(sections.filter(Boolean).join('\n\n'), { resultCount: 1 });
}

export const readTool = defineTool({
  name: 'read',
  description:
    'Read one meeting, chat, document or entity in full, by the id find returned. A meeting gives its summary, notes and to-dos (its ' +
    'transcript only when asked for); a document its pages (the first ones when long); an entity gives what the user approved about it, its relations and every meeting ' +
    'that discussed it, newest first.',
  input,
  async execute({ meeting_id, chat_id, entity_id, document_id, parts }) {
    if ([meeting_id, chat_id, entity_id, document_id].filter(Boolean).length !== 1) return fail('Give one of meeting_id, chat_id, document_id or entity_id: the id find returned.');
    if (meeting_id) return readMeeting(meeting_id, parts);
    if (chat_id) return readChat(chat_id);
    if (document_id) return readDocument(document_id);
    return readEntity(entity_id ?? '');
  },
});
