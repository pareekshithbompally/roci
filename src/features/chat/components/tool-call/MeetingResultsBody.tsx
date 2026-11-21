import React from 'react';
import { Surface, Text } from '@shared/ui';
import type { ToolCallView } from './toolCallView';
import { DefaultToolBody } from './DefaultToolBody';
import { ToolParameters } from './ToolParameters';

export interface MeetingResultRow {
  title: string;
  date: string;
  snippet?: string;
  id?: string;
}

// Line shapes written by find.tool.ts for meetings: a search, and a list (no query).
/** search: `1. "Title" (Jan 5, 2026)` */
const SEARCH_HEAD = /^\d+\. "(.*)" \(([^)]*)\)$/;
/** list: `1. "Title" — Jan 5, 2026 — ID: abc` */
const LIST_ROW = /^\d+\. "(.*)" — (.+) — ID: (.+)$/;
/** search: `   Relevance: high | Match: "snippet..."` */
const MATCH_LINE = /Match: "(.*)"$/;
/** search: `   Meeting ID: abc` */
const ID_LINE = /^Meeting ID: (.+)$/;

function headRow(line: string): MeetingResultRow | undefined {
  const list = line.match(LIST_ROW);
  if (list) return { title: list[1], date: list[2], id: list[3] };
  const search = line.match(SEARCH_HEAD);
  return search ? { title: search[1], date: search[2] } : undefined;
}

/** Applies a detail line (snippet / id) to the row it belongs to. */
function applyDetail(row: MeetingResultRow, line: string): void {
  const match = line.match(MATCH_LINE);
  if (match) row.snippet = match[1];
  const id = line.match(ID_LINE);
  if (id) row.id = id[1];
}

/** Parses a meeting tool's text result into rows; empty when nothing matches. */
export function parseMeetingResults(content: string): MeetingResultRow[] {
  const rows: MeetingResultRow[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const row = headRow(line);
    if (row) rows.push(row);
    else if (rows.length > 0) applyDetail(rows[rows.length - 1], line);
  }
  return rows;
}

function MeetingRow({ row }: { row: MeetingResultRow }) {
  return (
    <Surface as="li" className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <Text variant="bodyStrong" truncate className="flex-1 min-w-0">{row.title}</Text>
        <Text variant="caption" tone="faint" className="shrink-0">{row.date}</Text>
      </div>
      {row.snippet && <Text variant="helper" tone="muted" className="line-clamp-2">{row.snippet}</Text>}
    </Surface>
  );
}

/** A meeting find's results as a meeting list, with its parameters; the default body when unparseable. */
export const MeetingResultsBody: React.FC<{ part: ToolCallView }> = ({ part }) => {
  const rows = part.result && !part.result.isError ? parseMeetingResults(part.result.content) : [];
  if (rows.length === 0) return <DefaultToolBody part={part} />;
  return (
    <div className="flex flex-col gap-2">
      <Surface as="ul" className="flex flex-col max-h-48 overflow-y-auto">
        {rows.map((row, i) => <MeetingRow key={row.id ?? i} row={row} />)}
      </Surface>
      <ToolParameters part={part} />
    </div>
  );
};
