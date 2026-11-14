import React from 'react';
import { Surface, Text } from '@shared/ui';
import type { ToolCallPart } from './toolCallTitle';
import { DefaultToolBody } from './DefaultToolBody';

export interface MeetingResultRow {
  title: string;
  date: string;
  snippet?: string;
  id?: string;
}

// Line shapes written by search-meetings.tool.ts and list-meetings.tool.ts.
/** search_meetings: `1. "Title" (Jan 5, 2026)` */
const SEARCH_HEAD = /^\d+\. "(.*)" \(([^)]*)\)$/;
/** list_meetings: `1. "Title" — Jan 5, 2026 — ID: abc` */
const LIST_ROW = /^\d+\. "(.*)" — (.+) — ID: (.+)$/;
/** search_meetings: `   Relevance: high | Match: "snippet..."` */
const MATCH_LINE = /Match: "(.*)"$/;
/** search_meetings: `   Meeting ID: abc` */
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

/** search_meetings / list_meetings results as a meeting list; raw Input/Output when unparseable. */
export const MeetingResultsBody: React.FC<{ part: ToolCallPart }> = ({ part }) => {
  const rows = part.result && !part.result.isError ? parseMeetingResults(part.result.content) : [];
  if (rows.length === 0) return <DefaultToolBody part={part} />;
  return (
    <Surface as="ul" className="flex flex-col max-h-48 overflow-y-auto">
      {rows.map((row, i) => <MeetingRow key={row.id ?? i} row={row} />)}
    </Surface>
  );
};
