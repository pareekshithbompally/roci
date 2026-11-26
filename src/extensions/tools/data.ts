/** What the tools read: the database as it is now (never a copy the chat was handed), and the shapes they show it in. */

import { fetchMeetingBrief } from '@shared/query/items';
import type { HistoryItem, TodoEntry } from '@shared/types';
import { documentPages } from '@extensions/rag/searchIndex';
import { fail, localDateTimeOf } from './contract';
import { MAX_DOCUMENT_FOR_LLM } from './constants';
import type { ToolResult } from './types';

/** One meeting's row, read from roci.db; undefined when no meeting has that id. */
export async function findMeeting(id: string): Promise<HistoryItem | undefined> {
  return (await fetchMeetingBrief(id)) ?? undefined;
}

export function meetingNotFound(id: string): ToolResult {
  return fail(`No meeting has the ID "${id}". Get meeting IDs from find in meetings.`);
}

export function todoNotFound(id: string): ToolResult {
  return fail(`No to-do has the id "${id}". Get to-do ids from find in todos.`);
}

/** `- [ ] Book flights (due 2026-11-20, owner Sam, reminder 2026-11-19T09:00) — id: …`: the id suggest_todo takes, and
 *  dates in the form it takes them. */
export function todoLine(todo: TodoEntry): string {
  const details = [
    todo.dueDate && `due ${todo.dueDate.slice(0, 10)}`,
    todo.owner && `owner ${todo.owner}`,
    todo.reminder && `reminder ${localDateTimeOf(Date.parse(todo.reminder.dateTime))}`,
  ].filter(Boolean);
  const detail = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `- [${todo.completed ? 'x' : ' '}] ${todo.text}${detail} — id: ${todo.id}`;
}

/** A document as a tool reads it: its name, its first pages within the budget (each under its number; a text file is one
 *  page), and whether anything was left out. */
export interface DocumentReading {
  name: string;
  pageCount: number;
  text: string;
  cut: boolean;
}

/** The pages that fit in `budget` characters, in order, the last one cut short when it alone runs over. */
function pagesWithin(pages: string[], budget: number): { text: string; cut: boolean } {
  const sections: string[] = [];
  let left = budget;
  for (const [i, page] of pages.entries()) {
    const section = pages.length > 1 ? `### Page ${i + 1}\n${page.trim()}` : page.trim();
    if (section.length > left) {
      if (sections.length === 0) sections.push(section.slice(0, left));
      return { text: sections.join('\n\n'), cut: true };
    }
    sections.push(section);
    left -= section.length;
  }
  return { text: sections.join('\n\n'), cut: false };
}

/** The document at `path` read for a tool (PDFKit's text for a PDF); null when it is gone or can't be read. */
export async function readDocument(path: string): Promise<DocumentReading | null> {
  try {
    const { name, pages } = await documentPages(path);
    return { name, pageCount: pages.length, ...pagesWithin(pages, MAX_DOCUMENT_FOR_LLM) };
  } catch (error: unknown) {
    console.warn('[tools] Document not read:', path, error);
    return null;
  }
}

/** What a model is told when a document was read only in part. */
export const moreOf = (path: string) => `(Not all of it is shown: look things up in the rest with find in documents, document "${path}".)`;
