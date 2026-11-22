import React from 'react';
import { MeetingList } from '@shared/components';
import type { ToolCallView } from './toolCallView';
import { ToolParameters } from './ToolParameters';

/** A meeting find's results as the meetings it returned, then its parameters. */
export const MeetingResultsBody: React.FC<{ part: ToolCallView }> = ({ part }) => (
  <div className="flex flex-col gap-2">
    <MeetingList rows={part.meetings ?? []} className="max-h-48 overflow-y-auto" />
    <ToolParameters part={part} />
  </div>
);
