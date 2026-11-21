/** A meeting's Summary tab: the summary scrolling under a fade, and which models wrote it pinned to the bottom of the window;
 *  while it is being written, the overview card it will fill. `SummaryPane` is the tab without data loading (the dev preview
 *  renders it too). */

import React from 'react';
import { SummaryView, SummaryWriting } from '@features/summary';
import { useMeetingStats } from '@features/home/hooks/useMeetingStats';
import { LAYOUT } from '@config/layout.config';
import { SUMMARY_CONFIG as SUMMARY } from '@config/summary.config';
import { cn } from '@shared/ui';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import type { ProcessedResult } from '@shared/types';
import { ModelCreditLine, type ModelCredit } from '@shared/components';
import { TabPage } from './TabPage';

interface SummaryPaneProps {
  result: Pick<ProcessedResult, 'summary' | 'structuredSummary'>;
  phase: MeetingPhase;
  transcribedBy: ModelCredit | null;
  summarizedBy: ModelCredit | null;
}

export const SummaryPane: React.FC<SummaryPaneProps> = ({ result, phase, transcribedBy, summarizedBy }) => {
  const writing = !result.summary && !result.structuredSummary && isMeetingBusy(phase);
  return (
    <>
      <TabPage>
        {writing
          ? <SummaryWriting label={phase.kind === 'summarizing' ? SUMMARY.copy.summarizing : SUMMARY.copy.transcribing} />
          : <SummaryView summary={result.summary} structuredSummary={result.structuredSummary} />}
      </TabPage>
      {(transcribedBy || summarizedBy) && (
        <div className={cn('shrink-0 py-3', LAYOUT.pageGutter)}>
          <div className={LAYOUT.pageColumn}>
            <ModelCreditLine credits={[{ label: SUMMARY.copy.transcribedBy, credit: transcribedBy }, { label: SUMMARY.copy.summarizedBy, credit: summarizedBy }]} />
          </div>
        </div>
      )}
    </>
  );
};

export const SummaryTab: React.FC<{ result: ProcessedResult; phase: MeetingPhase; meetingId?: string }> = ({ result, phase, meetingId }) => {
  const { data: stats } = useMeetingStats(meetingId);
  return <SummaryPane result={result} phase={phase} transcribedBy={stats?.transcribedBy ?? null} summarizedBy={stats?.summarizedBy ?? null} />;
};
