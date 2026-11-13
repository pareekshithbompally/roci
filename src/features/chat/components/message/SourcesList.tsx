import React from 'react';
import { AudioWaveform } from 'lucide-react';
import { getFaviconUrl, extractDomain } from '@shared/utils/citationUtils';
import { TEXT } from '@config/theme.config';
import { Row } from '@shared/ui';
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

const sourceRowClass = `flex items-center gap-2.5 text-left w-full px-3 py-2 text-[13px] ${TEXT.muted} hover:text-paper-900 dark:hover:text-night-200 hover:bg-paper-200/80 dark:hover:bg-night-750/80 rounded-lg transition-colors cursor-pointer`;

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
          <AudioWaveform className={`w-4 h-4 shrink-0 ${TEXT.faint}`} />
          <span className="font-medium truncate">{citation.meetingTitle}</span>
          <span className={`ml-auto text-[11px] ${TEXT.faint} shrink-0`}>
            {new Date(citation.meetingTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </Row>
      ))}
      {hasMeetingCitations && moreMeetingCount > 0 && (
        <button
          onClick={() => onShowAllMeetingCitations?.(meetingCitations!)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${TEXT.faint} hover:text-paper-800 dark:hover:text-night-300 transition-colors`}
        >
          +{moreMeetingCount} more
        </button>
      )}
      {hasWebCitations && visibleWebCitations!.map((citation, i) => (
        <a
          key={`web-${i}-${citation.url}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className={sourceRowClass}
        >
          <img
            src={getFaviconUrl(citation.url)}
            alt=""
            className="w-3 h-3 shrink-0 rounded-sm"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="truncate">{citation.title || extractDomain(citation.url)}</span>
          <span className={`ml-auto text-[10px] ${TEXT.faint} shrink-0 truncate max-w-[100px]`}>
            {extractDomain(citation.url)}
          </span>
        </a>
      ))}
      {hasWebCitations && moreWebCount > 0 && (
        <button
          onClick={() => onShowAllWebCitations?.(webCitations!)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${TEXT.faint} hover:text-paper-800 dark:hover:text-night-300 transition-colors`}
        >
          +{moreWebCount} more
        </button>
      )}
    </>
  );
};

export default SourcesList;
