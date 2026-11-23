/** One heading for every step of a reply's work (thinking, a tool call, a folded run): its glyph, its title (shimmering
 *  while it runs) and trailing meta, as a secondary line under the reply's reading text. */

import React from 'react';
import { GlyphSlot, Text } from '@shared/ui';

export interface ActivityHeaderProps {
  /** The step's glyph (a kit Icon, an MCP server's icon). */
  glyph: React.ReactNode;
  title: string;
  /** The step is under way. */
  running?: boolean;
  /** Trailing facts: time taken, a failure badge, tokens and speed. */
  meta?: React.ReactNode;
}

export const ActivityHeader: React.FC<ActivityHeaderProps> = ({ glyph, title, running, meta }) => (
  <>
    <GlyphSlot>{glyph}</GlyphSlot>
    <Text variant="helper" tone="muted" shimmer={running} truncate className="mr-auto min-w-0">{title}</Text>
    {meta}
  </>
);
