import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
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

/** Built-in and native provider tools → glyph. MCP tools use the server's icon instead. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  search_meetings: Search,
  get_meeting: FileText,
  list_meetings: CalendarDays,
  list_todos: ListChecks,
  search_chats: MessageSquareText,
  get_chat: MessageSquare,
  list_chats: MessagesSquare,
  create_todo: SquarePlus,
  update_todo: SquareCheck,
  delete_todo: SquareX,
  webSearch: Globe,
  googleSearch: Globe,
  webSearchPreview: Globe,
  browserSearch: Globe,
};

/** Glyph for a built-in tool; a generic wrench for anything unregistered. */
export function toolCallIcon(toolName: string): LucideIcon {
  return TOOL_ICONS[toolName] ?? Wrench;
}
