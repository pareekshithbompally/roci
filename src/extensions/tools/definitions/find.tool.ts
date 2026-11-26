/** find: the user's own meetings, chats, documents, to-dos, memories or knowledge — searched when there is a query, newest
 *  first when there isn't. Meetings, chats and documents search the hybrid index (meaning and keywords; a document's passages
 *  each with its page, in the Knowledge library or one file attached to the chat); to-dos are read from roci.db; memories are
 *  matched word for word (a short list, already in chat's prompt); knowledge (people, projects, topics…) by name in the
 *  graph. Every result carries the id `read` and the suggest tools take. */

import { z } from 'zod';
import type { DocumentCitation, MeetingCitation, MeetingRow, ToolResult } from '@extensions/tools/types';
import { day, defineTool, idFrom, ok, text, toolDate } from '@extensions/tools/contract';
import { findMeeting, meetingNotFound, moreOf, readDocument, todoLine } from '@extensions/tools/data';
import { MAX_CITATION_EXCERPT_CHARS, MAX_DOCUMENT_CITATIONS, MAX_SNIPPET_CHARS, MAX_TODOS_FOR_LLM } from '@extensions/tools/constants';
import { searchChats, searchDocuments, searchMeetings, type DocumentSearchResult } from '@extensions/rag/searchIndex';
import { SCORE_HIGH, SCORE_MEDIUM } from '@extensions/rag/constants';
import { store, type GlobalTodoEntry } from '@services/db';
import { documentsService } from '@services/storage';
import { fetchMeetings } from '@shared/query/items';
import { queryClient } from '@shared/query/queryClient';
import { memoriesQuery } from '@shared/query/memories';
import { memoryLines } from '@shared/utils/memories';
import { memoryOn } from '@shared/utils/personalization';
import { matchesAllWords } from '@shared/utils/textMatch';
import { TODOS_CONFIG } from '@config/todos.config';
import { ROCI_SCREENS } from '@config/mcp.config';

const SCOPES = ['meetings', 'chats', 'documents', 'todos', 'memories', 'knowledge'] as const;

/** Default and most results: a search returns the best few, a list the newest. */
const COUNTS = { search: { fallback: 5, max: 20 }, list: { fallback: 10, max: 50 } };

const input = z.object({
  in: z
    .enum(SCOPES)
    .describe('meetings: what was said or decided. chats: only when the user means an earlier chat. documents: the files the user added to Knowledge, or one attached to this chat (give its document id), searched passage by passage, each with its page. todos: their to-dos. memories: what Roci remembers. knowledge: the people, organizations, projects, events and topics across meetings and memory, each with how many meetings discussed it; read one by its id for everything about it.'),
  query: text('Words to look for: topics, names, keywords. Leave out to list the newest.').optional(),
  from_date: day.optional().describe('meetings without a query: only those on or after this day, YYYY-MM-DD.'),
  to_date: day.optional().describe('meetings without a query: only those on or before this day, YYYY-MM-DD.'),
  status: z.enum(['open', 'done', 'all']).default('open').describe('todos: open (not done yet), done, or all.'),
  document: idFrom('the attached file\'s note or find in documents', 'documents: search only this document (its document id, e.g. an attached file).').optional(),
  meeting_id: idFrom('find in meetings', "todos: only this meeting's to-dos. meetings with a query: this meeting's passages that match (a long meeting, or the one being recorded).").optional(),
  limit: z.coerce.number().int().min(1).max(COUNTS.list.max).optional().describe(`How many to return: a search up to ${COUNTS.search.max}, a list up to ${COUNTS.list.max}.`),
});
type Input = z.output<typeof input>;

/** The count asked for, within what this kind of find returns. */
function countOf({ limit, query }: Input): number {
  const { fallback, max } = query ? COUNTS.search : COUNTS.list;
  return Math.min(limit ?? fallback, max);
}

// ── Meetings ──

/** Local midnight of a YYYY-MM-DD day, `days` later (epoch ms); none without a day. */
function startOfDay(date: string | undefined, days = 0): number | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + days).getTime();
}

const confidenceOf = (score: number) => (score >= SCORE_HIGH ? 'high' : score >= SCORE_MEDIUM ? 'medium' : 'low');

async function searchMeetingsFor(query: string, count: number): Promise<ToolResult> {
  const results = await searchMeetings(query, count);
  if (results.length === 0) return ok('No meetings match that search. Try other words, or find meetings without a query to list them by date.', { resultCount: 0 });

  // One entry per meeting: its best match.
  const best = new Map<string, (typeof results)[number]>();
  for (const r of results) if (!best.has(r.meetingId)) best.set(r.meetingId, r);
  const hits = [...best.values()];
  const meetings: MeetingRow[] = hits.map((r) => ({
    id: r.meetingId,
    title: r.meetingTitle,
    date: toolDate(r.timestamp),
    snippet: r.chunkText.slice(0, MAX_SNIPPET_CHARS).replace(/\n/g, ' '),
  }));
  const lines = hits.flatMap((r, i) => [
    `${i + 1}. "${meetings[i].title}" (${meetings[i].date})`,
    `   Relevance: ${confidenceOf(r.score)} | Match: "${meetings[i].snippet}..."`,
    `   Meeting ID: ${r.meetingId}`,
    '',
  ]);
  // Sources show only the truly relevant meetings.
  const citations: MeetingCitation[] = hits
    .filter((r) => r.score >= SCORE_HIGH)
    .map((r) => ({ meetingId: r.meetingId, meetingTitle: r.meetingTitle, meetingTimestamp: r.timestamp, excerpt: r.chunkText.slice(0, MAX_CITATION_EXCERPT_CHARS), score: r.score }));
  return ok([`Found ${hits.length} relevant meeting(s):\n`, ...lines].join('\n'), { resultCount: hits.length, citations, meetings });
}

/** One meeting's passages that match, best first: a long meeting, or the one being recorded, read in part. */
async function searchWithinMeeting(meetingId: string, query: string, count: number): Promise<ToolResult> {
  const results = await searchMeetings(query, count, meetingId);
  if (results.length === 0) return ok('Nothing in that meeting matches. Try other words, or read its transcript.', { resultCount: 0 });
  const lines = results.flatMap((r, i) => [`${i + 1}. Relevance: ${confidenceOf(r.score)}`, `   "${r.chunkText.replace(/\n/g, ' ')}"`, '']);
  const citations: MeetingCitation[] = results
    .filter((r) => r.score >= SCORE_HIGH)
    .map((r) => ({ meetingId, meetingTitle: r.meetingTitle, meetingTimestamp: r.timestamp, excerpt: r.chunkText.slice(0, MAX_CITATION_EXCERPT_CHARS), score: r.score }));
  return ok([`${results.length} passage(s) of "${results[0].meetingTitle}" (meeting ID: ${meetingId}):\n`, ...lines].join('\n'), { resultCount: results.length, citations });
}

async function listMeetings({ from_date, to_date }: Input, count: number): Promise<ToolResult> {
  // One more than asked, so the reply can say there are more.
  const found = await fetchMeetings({ since: startOfDay(from_date), until: startOfDay(to_date, 1) }, count + 1);
  const range = from_date || to_date ? ` from ${from_date ?? 'the first'} to ${to_date ?? 'today'}` : '';
  if (found.length === 0) return ok(`No meetings${range}.`, { resultCount: 0 });
  const shown = found.slice(0, count);
  const more = found.length > count ? ' — there are more; narrow the dates or raise the limit' : '';
  const meetings: MeetingRow[] = shown.map((m) => ({ id: m.id, title: m.title, date: toolDate(m.timestamp) }));
  const lines = meetings.map((m, i) => `${i + 1}. "${m.title}" — ${m.date} — ID: ${m.id}`);
  return ok([`Meetings${range} (newest ${shown.length}${more}):`, '', ...lines].join('\n'), { resultCount: shown.length, meetings });
}

/** Meetings: one meeting's matching passages, the meetings that match, or the newest. */
function meetingsFor(args: Input): Promise<ToolResult> {
  if (!args.query) return listMeetings(args, countOf(args));
  return args.meeting_id ? searchWithinMeeting(args.meeting_id, args.query, countOf(args)) : searchMeetingsFor(args.query, countOf(args));
}

// ── Chats ──

async function searchChatsFor(query: string, count: number): Promise<ToolResult> {
  const results = await searchChats(query, count);
  if (results.length === 0) return ok('No chats match that search. Try other words, or find chats without a query to list them.', { resultCount: 0 });
  const lines = results.flatMap((r, i) => [
    `${i + 1}. "${r.sessionTitle}" (${toolDate(r.lastMessageAt)})`,
    `   Relevance: ${confidenceOf(r.score)} | Excerpt: "${r.chunkText.slice(0, MAX_SNIPPET_CHARS).replace(/\n/g, ' ')}..."`,
    `   Chat ID: ${r.sessionId}`,
    '',
  ]);
  return ok([`Found ${results.length} relevant chat(s):\n`, ...lines].join('\n'), { resultCount: results.length });
}

async function listChats(count: number): Promise<ToolResult> {
  const chats = (await store.items.page(null, count, { kind: 'chat' })).flatMap((item) => (item.kind === 'chat' ? [item.chat] : []));
  if (chats.length === 0) return ok('No chats yet.', { resultCount: 0 });
  const lines = chats.map((c, i) => `${i + 1}. "${c.title}" — ${toolDate(c.lastMessageAt)} — ID: ${c.id}`);
  return ok([`${chats.length} recent chat(s):`, '', ...lines].join('\n'), { resultCount: chats.length });
}

// ── Documents ──

/** "page 3" where the passage has one. */
const onPage = (page: number | null) => (page ? `, page ${page}` : '');

/** The passages an answer cites: every one search returned is a real match (meaning above a floor, or the words), so the
 *  best few, each document page once. */
function documentCitationsOf(results: DocumentSearchResult[]): DocumentCitation[] {
  const seen = new Set<string>();
  return results
    .filter((r) => !seen.has(`${r.path}#${r.page}`) && seen.add(`${r.path}#${r.page}`))
    .slice(0, MAX_DOCUMENT_CITATIONS)
    .map((r) => ({ path: r.path, name: r.name, page: r.page, excerpt: r.chunkText.slice(0, MAX_CITATION_EXCERPT_CHARS), score: r.score }));
}

/** One document with nothing in its index to match (yet: it may still be indexing): its first pages, read. */
async function firstPagesOf(path: string): Promise<ToolResult> {
  const document = await readDocument(path);
  if (!document?.text) return ok('Nothing in that document can be searched: it has no text Roci can read (a scan?), or it is gone.', { resultCount: 0 });
  const citation: DocumentCitation = { path, name: document.name, page: null, excerpt: document.text.slice(0, MAX_CITATION_EXCERPT_CHARS), score: 1 };
  const more = document.cut ? `\n\n${moreOf(path)}` : '';
  return ok(`Nothing in "${document.name}" matched those words (it may still be indexing). Its first pages:\n\n${document.text}${more}`, { resultCount: 1, documentCitations: [citation] });
}

async function searchDocumentsFor(query: string, count: number, document: string | undefined): Promise<ToolResult> {
  const results = await searchDocuments(query, count, document ? [document] : undefined);
  if (results.length === 0) {
    return document ? firstPagesOf(document) : ok('No documents match that search. Try other words, or find documents without a query to list them.', { resultCount: 0 });
  }
  const lines = results.flatMap((r, i) => [
    `${i + 1}. "${r.name}"${onPage(r.page)}`,
    `   "${r.chunkText.replace(/\n/g, ' ')}"`,
    `   Document ID: ${r.path}`,
    '',
  ]);
  return ok([`Found ${results.length} passage(s):\n`, ...lines].join('\n'), { resultCount: results.length, documentCitations: documentCitationsOf(results) });
}

async function listDocuments(count: number): Promise<ToolResult> {
  const documents = await documentsService.list(count);
  if (documents.length === 0) return ok('No documents in Knowledge yet.', { resultCount: 0 });
  const lines = documents.map((d, i) => `${i + 1}. "${d.name}" — added ${toolDate(d.createdAt)} — Document ID: ${d.appPath}`);
  return ok([`${documents.length} document(s) in Knowledge, newest first:`, '', ...lines].join('\n'), { resultCount: documents.length });
}

/** Documents: the passages that match (in one document when given), or the library's newest. */
function documentsFor({ query, document, ...args }: Input): Promise<ToolResult> {
  const count = countOf({ query, document, ...args });
  if (query) return searchDocumentsFor(query, count, document);
  if (document) return Promise.resolve(ok('Give words to look for in that document, or read it.', { resultCount: 0 }));
  return listDocuments(count);
}

// ── To-dos ──

const STATUS = { open: false, done: true, all: undefined } as const;

/** Lines grouped under their meeting (or General), in the order the to-dos came. */
function grouped(todos: GlobalTodoEntry[]): string[] {
  const groups = new Map<string, string[]>();
  for (const todo of todos) {
    const heading = todo.meetingTitle ? `From "${todo.meetingTitle}" (meeting ID: ${todo.meetingId}):` : `${TODOS_CONFIG.general} (not from a meeting):`;
    groups.set(heading, [...(groups.get(heading) ?? []), todoLine(todo)]);
  }
  return [...groups].flatMap(([heading, lines]) => ['', heading, ...lines]);
}

/** The to-dos asked for and how many there are in all (every one when searching, so a match further back is found);
 *  null when the meeting doesn't exist. */
async function todosFor({ status, meeting_id, query }: Input): Promise<{ todos: GlobalTodoEntry[]; total: number } | null> {
  if (!meeting_id) {
    const newest = await store.todos.listGlobal(STATUS[status], MAX_TODOS_FOR_LLM, 0);
    if (!query || newest.total <= newest.items.length) return { todos: newest.items, total: newest.total };
    const { items, total } = await store.todos.listGlobal(STATUS[status], newest.total, 0);
    return { todos: items, total };
  }
  if (!(await findMeeting(meeting_id))) return null;
  const todos = (await store.todos.listForMeeting(meeting_id)).filter((t) => STATUS[status] === undefined || t.completed === STATUS[status]);
  return { todos, total: todos.length };
}

async function findTodos(args: Input): Promise<ToolResult> {
  const found = await todosFor(args);
  if (!found) return meetingNotFound(args.meeting_id ?? '');
  const todos = args.query ? found.todos.filter((t) => matchesAllWords(t.text, args.query ?? '')) : found.todos;
  const label = args.status === 'all' ? 'To-dos' : `${args.status === 'open' ? 'Open' : 'Done'} to-dos`;
  if (todos.length === 0) return ok(`No ${label.toLowerCase()}${args.meeting_id ? ' in that meeting' : ''}${args.query ? ' match that search' : ''}.`, { resultCount: 0 });
  const shown = todos.slice(0, MAX_TODOS_FOR_LLM);
  const total = args.query ? todos.length : found.total;
  const count = shown.length < total ? `${total} (showing the ${shown.length} newest)` : `${total}`;
  return ok([`${label}: ${count}`, ...grouped(shown)].join('\n'), { resultCount: shown.length });
}

// ── Memories ──

async function findMemories(query: string | undefined): Promise<ToolResult> {
  if (!memoryOn()) return ok('Memory is off in Roci.', { resultCount: 0 });
  const all = memoryLines(await queryClient.fetchQuery(memoriesQuery));
  const found = query ? all.filter((m) => matchesAllWords(m.text, query)) : all;
  if (found.length === 0) return ok(query ? 'No saved memory matches.' : 'Nothing is saved in memory yet.', { resultCount: 0 });
  return ok(found.map((m) => `- (${m.id}) ${m.text}`).join('\n'), { resultCount: found.length });
}

// ── Knowledge ──

async function findKnowledge(query: string | undefined, count: number): Promise<ToolResult> {
  const found = await store.knowledge.find(query ?? '', count);
  if (found.length === 0) return ok(query ? 'No person, project or topic matches that name.' : 'Nothing is known yet.', { resultCount: 0 });
  const lines = found.map((e) => `- ${e.name} (${e.entity_type}) — ${e.meetings} meeting(s) — id: ${e.id}`);
  return ok(lines.join('\n'), { resultCount: found.length });
}

const FIND: Record<(typeof SCOPES)[number], (args: Input) => Promise<ToolResult>> = {
  meetings: (args) => meetingsFor(args),
  chats: (args) => (args.query ? searchChatsFor(args.query, countOf(args)) : listChats(countOf(args))),
  documents: documentsFor,
  todos: findTodos,
  memories: (args) => findMemories(args.query),
  knowledge: (args) => findKnowledge(args.query, countOf(args)),
};

export const findTool = defineTool({
  name: 'find',
  screen: ROCI_SCREENS.meetings.uri,
  description:
    "Find the user's own meetings, chats, documents, to-dos, memories or knowledge (the people, projects and topics in them); not for " +
    'facts about the world. Set `in`. With a query: the ' +
    'best matches, by meaning and keywords. Without: the newest. Results carry ids; read one only when the snippets do not answer.',
  input,
  execute: (args) => FIND[args.in](args),
});
