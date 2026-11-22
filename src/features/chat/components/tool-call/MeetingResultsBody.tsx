import React from 'react';
import { Surface, Text } from '@shared/ui';
import type { MeetingRow } from '@extensions/tools/types';
import type { ToolCallView } from './toolCallView';
import { ToolParameters } from './ToolParameters';

function MeetingItem({ row }: { row: MeetingRow }) {
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

/** A meeting find's results as the meetings it returned, then its parameters. */
export const MeetingResultsBody: React.FC<{ part: ToolCallView }> = ({ part }) => (
  <div className="flex flex-col gap-2">
    <Surface as="ul" className="flex flex-col max-h-48 overflow-y-auto">
      {part.meetings?.map((row) => <MeetingItem key={row.id} row={row} />)}
    </Surface>
    <ToolParameters part={part} />
  </div>
);
