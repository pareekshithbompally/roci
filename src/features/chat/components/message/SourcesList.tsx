import React from 'react';
import { formatShortDate } from '@shared/utils/formatters';
import { AudioWaveform } from 'lucide-react';
import { getFaviconUrl, describeCitation } from '@shared/utils/citationUtils';
import { Row, rowClasses, Text, Icon, Button } from '@shared/ui';
import type { MeetingCitation, WebCitation } from '@shared/types';

interface SourcesListProps {
  meetingCitations?: MeetingCitation[];
  webCitations?: WebCitation[];
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllMeetingCitations?: (citations: MeetingCitation[]) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
}

const MAX_VISIBLE_WEB = 3;
const MAX_VISIBLE_MEETING = 3;

/** Renders meeting and web citation rows with an optional "+N more" overflow button */
const SourcesList: React.FC<SourcesListProps> = ({
  meetingCitations,
  webCitations,
  onCitationClick,
  onShowAllMeetingCitations,
  onShowAllWebCitations,
}) => {
  const hasMeetingCitations = !!(meetingCitations && meetingCitations.length > 0);
  const hasWebCitations = !!(webCitations && webCitations.length > 0);

  const visibleWebCitations = onShowAllWebCitations ? webCitations?.slice(0, MAX_VISIBLE_WEB) : webCitations;
  const moreWebCount = onShowAllWebCitations ? Math.max(0, (webCitations?.length ?? 0) - MAX_VISIBLE_WEB) : 0;

  const visibleMeetingCitations = onShowAllMeetingCitations ? meetingCitations?.slice(0, MAX_VISIBLE_MEETING) : meetingCitations;
  const moreMeetingCount = onShowAllMeetingCitations ? Math.max(0, (meetingCitations?.length ?? 0) - MAX_VISIBLE_MEETING) : 0;

  return (
    <>
      {hasMeetingCitations && visibleMeetingCitations!.map((citation) => (
        <Row key={citation.meetingId} onClick={() => onCitationClick?.(citation)}>
          <Icon icon={AudioWaveform} size="sm" tone="faint" className="shrink-0" />
          <Text variant="bodyStrong" truncate>{citation.meetingTitle}</Text>
          <Text variant="caption" tone="faint" className="ml-auto shrink-0">
            {formatShortDate(citation.meetingTimestamp)}
          </Text>
        </Row>
      ))}
      {hasMeetingCitations && moreMeetingCount > 0 && (
        <Button variant="ghost" size="inline" className="self-start mx-2.5 my-1" onClick={() => onShowAllMeetingCitations?.(meetingCitations!)}>
          +{moreMeetingCount} more
        </Button>
      )}
      {hasWebCitations && visibleWebCitations!.map((citation, i) => {
        const label = describeCitation(citation);
        return (
        <a
          key={`web-${i}-${citation.url}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className={rowClasses()}
        >
          <img
            src={getFaviconUrl(label.site)}
            alt=""
            className="w-3 h-3 shrink-0"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="truncate">{label.name}</span>
          {label.detail && (
            <Text variant="caption" tone="faint" truncate className="ml-auto shrink-0 max-w-24">
              {label.detail}
            </Text>
          )}
        </a>
        );
      })}
      {hasWebCitations && moreWebCount > 0 && (
        <Button variant="ghost" size="inline" className="self-start mx-2.5 my-1" onClick={() => onShowAllWebCitations?.(webCitations!)}>
          +{moreWebCount} more
        </Button>
      )}
    </>
  );
};

export default SourcesList;
