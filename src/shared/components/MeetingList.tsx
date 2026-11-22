/** Meetings a search returned, each by its title, date and the passage that matched: in a meeting find's row in chat, and in
 *  the screen Roci's MCP server gives agents' apps for the same find. */

import React from 'react';
import { Surface, Text, cn } from '@shared/ui';
import type { MeetingRow } from '@extensions/tools/types';

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

export const MeetingList: React.FC<{ rows: MeetingRow[]; className?: string }> = ({ rows, className }) => (
  <Surface as="ul" className={cn('flex flex-col', className)}>
    {rows.map((row) => <MeetingItem key={row.id} row={row} />)}
  </Surface>
);
