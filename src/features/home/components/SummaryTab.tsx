/** A meeting's Summary tab: the summary in its tab page; while it is being written, the overview it will fill. Which models
 *  wrote it is in the meeting's ⋯ menu. `SummaryPane` is the tab without data loading (the dev preview renders it too). */

import React from 'react';
import { SummaryView, SummaryWriting } from '@features/summary';
import { SUMMARY_CONFIG as SUMMARY } from '@config/summary.config';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import type { ProcessedResult } from '@shared/types';
import { TabPage } from './TabPage';

interface SummaryPaneProps {
  result: Pick<ProcessedResult, 'summary' | 'structuredSummary'>;
  phase: MeetingPhase;
  /** After the summary (iPhone: your notes, which a Mac shows beside the transcript). */
  after?: React.ReactNode;
}

export const SummaryPane: React.FC<SummaryPaneProps> = ({ result, phase, after }) => {
  const writing = !result.summary && !result.structuredSummary && isMeetingBusy(phase);
  return (
    <TabPage>
      {writing
        ? <SummaryWriting label={phase.kind === 'summarizing' ? SUMMARY.copy.summarizing : SUMMARY.copy.transcribing} />
        : <SummaryView summary={result.summary} structuredSummary={result.structuredSummary} />}
      {after}
    </TabPage>
  );
};

export const SummaryTab = SummaryPane;
