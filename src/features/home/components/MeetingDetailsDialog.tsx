/** A meeting's details (from its ⋯ menu): the recording, the transcript and the summary, each a grouped card of rows. A
 *  view with nothing to save: a Mac sheet with Done, a phone sheet with ✓. */

import React from 'react';
import { CardRow, Section, Text } from '@shared/ui';
import { CostBadge, FormDialog, ModelBadge, ShowInFinderButton } from '@shared/components';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { MEETING_DETAILS_COPY as COPY } from '@config/meetingLive.config';
import { formatDuration, formatFileSize, formatDateTime } from '@shared/utils/formatters';
import { formatTokenCount } from '@extensions/usage/format';
import { useMeetingStats, type MeetingStats } from '@features/home/hooks/useMeetingStats';

/** A label and its value, the value at the row's end. */
const ValueRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <CardRow title={label} actions={<div className="flex min-w-0 items-center gap-2">{children}</div>} />
);

const Value: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text tone="muted" truncate>{children}</Text>;

function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  return AUDIO_CONFIG.captureSources[source as Exclude<AudioCaptureSource, 'file-upload'>]?.label ?? null;
}

const RecordingSection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  const source = sourceLabel(stats.inputSource);
  const file = stats.recording;
  return (
    <Section title={COPY.recording}>
      <ValueRow label={COPY.recorded}><Value>{formatDateTime(stats.recordedAt)}</Value></ValueRow>
      {stats.durationSeconds !== null && <ValueRow label={COPY.length}><Value>{formatDuration(stats.durationSeconds)}</Value></ValueRow>}
      {source && <ValueRow label={COPY.source}><Value>{source}</Value></ValueRow>}
      {file && (
        <ValueRow label={COPY.file}>
          <Value>{formatFileSize(file.sizeBytes)}</Value>
          <ShowInFinderButton path={file.path} />
        </ValueRow>
      )}
    </Section>
  );
};

const TranscriptSection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  if (stats.words === 0 && !stats.transcribedBy) return null;
  const counts = [COPY.words(stats.words), stats.speakers > 0 && COPY.speakers(stats.speakers)].filter(Boolean).join(' · ');
  return (
    <Section title={COPY.transcript}>
      {stats.words > 0 && <ValueRow label={COPY.length}><Value>{counts}</Value></ValueRow>}
      {stats.transcribedBy && (
        <ValueRow label={COPY.model}>
          <ModelBadge {...stats.transcribedBy} />
          <CostBadge cost={stats.transcriptCost} />
        </ValueRow>
      )}
    </Section>
  );
};

const SummarySection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  const summary = stats.summarizedBy;
  if (!summary) return null;
  const billed = summary.inputTokens + summary.outputTokens > 0;
  return (
    <Section title={COPY.summary}>
      <ValueRow label={COPY.model}>
        <ModelBadge provider={summary.provider} model={summary.model} />
        <CostBadge cost={stats.summaryCost} />
      </ValueRow>
      {billed && (
        <ValueRow label={COPY.usage}>
          <Value>{COPY.tokens(formatTokenCount(summary.inputTokens), formatTokenCount(summary.outputTokens))}</Value>
        </ValueRow>
      )}
    </Section>
  );
};

interface MeetingDetailsDialogProps {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MeetingDetailsDialog: React.FC<MeetingDetailsDialogProps> = ({ meetingId, open, onOpenChange }) => {
  const { data: stats } = useMeetingStats(meetingId);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={COPY.title} submit={{ label: COPY.done, onPress: () => onOpenChange(false) }} viewOnly>
      {stats ? (
        <div className="flex flex-col gap-section">
          <RecordingSection stats={stats} />
          <TranscriptSection stats={stats} />
          <SummarySection stats={stats} />
        </div>
      ) : (
        <Text as="p" variant="helper" tone="muted">{COPY.loading}</Text>
      )}
    </FormDialog>
  );
};
