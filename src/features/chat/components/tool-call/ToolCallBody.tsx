import React from 'react';
import type { ToolCallView } from './toolCallView';
import { DefaultToolBody } from './DefaultToolBody';
import { MeetingResultsBody } from './MeetingResultsBody';

type ToolBody = React.FC<{ part: ToolCallView }>;

/** A call that returned meetings lists them; any other shows its Output and Parameters. */
export function toolBodyFor(part: ToolCallView): ToolBody {
  return part.meetings?.length ? MeetingResultsBody : DefaultToolBody;
}

export const ToolCallBody: React.FC<{ part: ToolCallView }> = ({ part }) => {
  const Body = toolBodyFor(part);
  return <Body part={part} />;
};
