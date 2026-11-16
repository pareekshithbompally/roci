/** Slide-in meeting summary and transcript for a clicked citation; over the chat, not a window-level dialog. */

import React, { useState, useEffect } from 'react';
import { X, ExternalLink, FileText, Mic, ArrowLeft, AudioWaveform, Loader2 } from 'lucide-react';
import { ParsedTranscript } from '@features/transcription';
import { Button, Drawer, Row, Tabs, IconButton, Icon, Surface, Text } from '@shared/ui';
import type { MeetingCitation, HistoryItem } from '@shared/types';

interface MeetingCitationDrawerProps {
  mode: 'list' | 'detail';
  citations: MeetingCitation[] | null;
  activeCitation: MeetingCitation | null;
  meeting: HistoryItem | null;
  isLoading?: boolean;
  onClose: () => void;
  onCitationClick: (citation: MeetingCitation) => void;
  onBack: () => void;
  onOpenInMain?: () => void;
}

type DrawerTab = 'summary' | 'transcript';

const DRAWER_TABS = [
  { value: 'transcript', label: 'Transcript' },
  { value: 'summary', label: 'Summary' },
] as const satisfies readonly { value: DrawerTab; label: string }[];

export const MeetingCitationDrawer: React.FC<MeetingCitationDrawerProps> = ({
  mode,
  citations,
  activeCitation,
  meeting,
  onClose,
  onCitationClick,
  onBack,
  onOpenInMain,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('transcript');
  const isOpen = (mode === 'list' && citations !== null && citations.length > 0) || (mode === 'detail' && activeCitation !== null);

  // Key on the whole citation: meetingId alone misses a new excerpt from the same meeting.
  const citationKey = activeCitation
    ? `${activeCitation.meetingId}:${activeCitation.excerpt}`
    : null;
  useEffect(() => {
    if (citationKey) setActiveTab('transcript');
  }, [citationKey]);

  return (
    <Drawer open={isOpen} onClose={onClose} label="Meeting details">
      {/* Header */}
      <Surface edge="bottom" className="shrink-0 flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {mode === 'detail' ? (
            <IconButton icon={ArrowLeft} label="Back to list" size="sm" className="shrink-0" onClick={onBack} />
          ) : (
            <Icon icon={Mic} size="sm" tone="faint" className="shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 mt-0.5">
            <Text as="h3" variant="headline" truncate>
              {mode === 'detail' ? (activeCitation?.meetingTitle ?? '') : 'Meeting Sources'}
            </Text>
            {mode === 'detail' && activeCitation && (
              <Text as="p" variant="caption" tone="faint" className="mt-0.5">
                {new Date(activeCitation.meetingTimestamp).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            )}
            {mode === 'list' && citations && (
              <Text as="p" variant="caption" tone="faint" className="mt-0.5">
                {citations.length} {citations.length === 1 ? 'source' : 'sources'} found
              </Text>
            )}
          </div>
        </div>
        <IconButton icon={X} label="Close" size="sm" className="shrink-0" onClick={onClose} />
      </Surface>

      {/* Tabs - Only for detail mode */}
      {mode === 'detail' && (
        <div className="shrink-0 px-4 py-2">
          <Tabs items={DRAWER_TABS} value={activeTab} onValueChange={setActiveTab} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {mode === 'list' ? (
          /* List Mode */
          <div className="p-2 flex flex-col gap-1">
            {citations?.map((c) => (
              <Row
                key={c.meetingId}
                onClick={() => onCitationClick(c)}
              >
                <Icon icon={AudioWaveform} size="sm" tone="faint" className="shrink-0" />
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <Text variant="bodyStrong" truncate className="w-full">{c.meetingTitle}</Text>
                  <Text variant="caption" tone="faint" className="shrink-0 mt-0.5">
                    {new Date(c.meetingTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </div>
              </Row>
            ))}
          </div>
        ) : isLoading ? (
          /* Loading State */
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <Icon icon={Loader2} size="lg" tone="faint" className="animate-spin" />
            <Text as="p" variant="helper" tone="muted">Loading meeting data...</Text>
          </div>
        ) : !meeting ? (
          /* Detail Mode: Meeting not found */
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <Icon icon={FileText} size="xl" tone="faint" />
            <Text as="p" tone="muted" className="text-center">Meeting not found</Text>
          </div>
        ) : activeTab === 'summary' ? (
          /* Detail Mode: Summary tab */
          <Text as="div" variant="reading" tone="muted" className="p-4 whitespace-pre-wrap">
            {meeting.summary || <Text tone="faint">No summary available.</Text>}
          </Text>
        ) : (
          /* Detail Mode: Transcript tab with highlight */
          <div className="p-4">
            <ParsedTranscript
              text={meeting.transcript}
              highlightText={activeCitation?.excerpt}
            />
          </div>
        )}
      </div>

      {/* Footer - Only for detail mode */}
      {mode === 'detail' && meeting && onOpenInMain && (
        <Surface edge="top" className="shrink-0 px-4 py-3">
          <Button variant="link" size="inline" onClick={onOpenInMain}>
            <Icon icon={ExternalLink} size="xs" />
            View full meeting
          </Button>
        </Surface>
      )}
    </Drawer>
  );
};

export default MeetingCitationDrawer;
