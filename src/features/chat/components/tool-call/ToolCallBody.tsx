import React from 'react';
import { toolKey, type ToolCallView } from './toolCallView';
import { DefaultToolBody } from './DefaultToolBody';
import { MeetingResultsBody } from './MeetingResultsBody';

type ToolBody = React.FC<{ part: ToolCallView }>;

/** Built-in tool calls with a specialised body, by `toolKey`; everything else gets Output and Parameters. */
const BODIES: Record<string, ToolBody> = {
  'find.meetings': MeetingResultsBody,
  'find.meetings.list': MeetingResultsBody,
};

/** Picks the body renderer for a tool call. MCP tools always use the default body. */
export function toolBodyFor(part: ToolCallView): ToolBody {
  if (part.source) return DefaultToolBody;
  return BODIES[toolKey(part)] ?? DefaultToolBody;
}

export const ToolCallBody: React.FC<{ part: ToolCallView }> = ({ part }) => {
  const Body = toolBodyFor(part);
  return <Body part={part} />;
};
