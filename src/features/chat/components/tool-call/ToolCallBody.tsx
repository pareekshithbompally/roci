import React from 'react';
import type { ToolCallView } from './toolCallView';
import { DefaultToolBody } from './DefaultToolBody';
import { MeetingResultsBody } from './MeetingResultsBody';

type ToolBody = React.FC<{ part: ToolCallView }>;

/** Built-in tools with a specialised body; everything else gets Input/Output. */
const BODIES: Record<string, ToolBody> = {
  search_meetings: MeetingResultsBody,
  list_meetings: MeetingResultsBody,
};

/** Picks the body renderer for a tool call. MCP tools always use the default body. */
export function toolBodyFor(part: ToolCallView): ToolBody {
  if (part.source) return DefaultToolBody;
  return BODIES[part.toolName] ?? DefaultToolBody;
}

export const ToolCallBody: React.FC<{ part: ToolCallView }> = ({ part }) => {
  const Body = toolBodyFor(part);
  return <Body part={part} />;
};
