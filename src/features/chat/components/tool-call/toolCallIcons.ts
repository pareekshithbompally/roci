import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  CalendarDays,
  Network,
  FileText,
  Globe,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  Search,
  SquareCheck,
  SquarePlus,
  SquareX,
  Wrench,
} from 'lucide-react';

/** Built-in and native provider tools → glyph, by `toolKey`. MCP tools use the server's icon instead. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  // A tool by its bare name (Usage lists calls per tool).
  find: Search,
  read: FileText,
  suggest_todo: SquarePlus,
  suggest_memory: Brain,
  'find.meetings': Search,
  'find.meetings.list': CalendarDays,
  'find.chats': MessageSquareText,
  'find.chats.list': MessagesSquare,
  'find.todos': ListChecks,
  'find.todos.list': ListChecks,
  'find.memories': Brain,
  'find.memories.list': Brain,
  'find.knowledge': Network,
  'find.knowledge.list': Network,
  'read.entity': Network,
  'read.meeting': FileText,
  'read.chat': MessageSquare,
  'suggest_todo.add': SquarePlus,
  'suggest_todo.update': SquareCheck,
  'suggest_todo.delete': SquareX,
  'suggest_memory.save': Brain,
  'suggest_memory.forget': Brain,
  webSearch: Globe,
  googleSearch: Globe,
  webSearchPreview: Globe,
  browserSearch: Globe,
};

/** Glyph for a built-in tool call (its `toolKey`); a generic wrench for anything unregistered. */
export function toolCallIcon(key: string): LucideIcon {
  return TOOL_ICONS[key] ?? Wrench;
}
