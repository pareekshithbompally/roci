/** The ⓘ next to a meeting's title: the recording, the transcript and the summary, each in its own section. */

import React from 'react';
import { Info } from 'lucide-react';
import { IconButton, Popover, PopoverContent, PopoverTrigger, RowGroupLabel, Separator, Text } from '@shared/ui';
import { CostBadge, ModelBadge, ShowInFinderButton } from '@shared/components';
import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { formatDuration, formatFileSize, formatDateTime } from '@shared/utils/formatters';
import { formatTokenCount } from '@extensions/usage/format';
import { useMeetingStats, type MeetingStats } from '@features/home/hooks/useMeetingStats';

const StatRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-6 px-2 py-1.5">
    <Text variant="helper" tone="muted" className="shrink-0">{label}</Text>
    <div className="min-w-0 flex items-center justify-end gap-2 text-right">{children}</div>
  </div>
);

const Value: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text variant="helper">{children}</Text>;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="pb-1">
    <RowGroupLabel>{title}</RowGroupLabel>
    {children}
  </section>
);

function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  return AUDIO_CONFIG.captureSources[source as Exclude<AudioCaptureSource, 'file-upload'>]?.label ?? null;
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

const RecordingSection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  const source = sourceLabel(stats.inputSource);
  const file = stats.recording;
  return (
    <Section title="Recording">
      <StatRow label="Recorded">
        <Value>{formatDateTime(stats.recordedAt)}</Value>
      </StatRow>
      {stats.durationSeconds !== null && <StatRow label="Length"><Value>{formatDuration(stats.durationSeconds)}</Value></StatRow>}
      {source && <StatRow label="Source"><Value>{source}</Value></StatRow>}
      {file && (
        <StatRow label="File">
          <Value>{formatFileSize(file.sizeBytes)}</Value>
          <ShowInFinderButton path={file.path} />
        </StatRow>
      )}
    </Section>
  );
};

const TranscriptSection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  if (stats.words === 0 && !stats.transcribedBy) return null;
  const counts = [plural(stats.words, 'word'), stats.speakers > 0 && plural(stats.speakers, 'speaker')].filter(Boolean).join(' · ');
  return (
    <Section title="Transcript">
      {stats.words > 0 && <StatRow label="Length"><Value>{counts}</Value></StatRow>}
      {stats.transcribedBy && (
        <StatRow label="Model">
          <ModelBadge {...stats.transcribedBy} />
          <CostBadge cost={stats.transcriptCost} />
        </StatRow>
      )}
    </Section>
  );
};

const SummarySection: React.FC<{ stats: MeetingStats }> = ({ stats }) => {
  const summary = stats.summarizedBy;
  if (!summary) return null;
  const billed = summary.inputTokens + summary.outputTokens > 0;
  return (
    <Section title="Summary">
      <StatRow label="Model">
        <ModelBadge provider={summary.provider} model={summary.model} />
        <CostBadge cost={stats.summaryCost} />
      </StatRow>
      {billed && (
        <StatRow label="Usage">
          <Value>{formatTokenCount(summary.inputTokens)} in · {formatTokenCount(summary.outputTokens)} out</Value>
        </StatRow>
      )}
    </Section>
  );
};

export const MeetingStatsPopover: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const { data: stats } = useMeetingStats(meetingId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton icon={Info} size="sm" label="About this meeting" className="shrink-0" />
      </PopoverTrigger>
      <PopoverContent width="xl" align="start" className="py-3 px-2">
        <Text as="h3" variant="bodyStrong" className="px-2">About this meeting</Text>
        <Separator className="mt-3" />
        {stats ? (
          <>
            <RecordingSection stats={stats} />
            <TranscriptSection stats={stats} />
            <SummarySection stats={stats} />
          </>
        ) : (
          <Text as="p" variant="helper" tone="muted" className="px-2 pt-3">Loading…</Text>
        )}
      </PopoverContent>
    </Popover>
  );
};
