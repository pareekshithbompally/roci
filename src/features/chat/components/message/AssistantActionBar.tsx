import React, { useState, useEffect } from 'react';
import { Copy, Check, Gauge, Loader2, Square, Volume2 } from 'lucide-react';
import type { ReadAloud, ReadAloudState } from '@shared/hooks/useReadAloud';
import SuggestionsList from './SuggestionsList';
import SourcesList from './SourcesList';
import type { ActionProps, CitationHandlers } from './types';
import type { MeetingCitation, WebCitation } from '@shared/types';
import { Tooltip, Tabs, Button, IconButton, Separator, Dot, Text } from '@shared/ui';
import { platform } from '@platform/index';

/** Read aloud's glyph: speaker, then a spinner while the voice gets ready, then stop. */
const READ_ALOUD_ICON: Record<ReadAloudState, typeof Volume2> = { idle: Volume2, preparing: Loader2, speaking: Square };

interface AssistantActionBarProps {
  id: string;
  text: string;
  timestamp?: number;
  isLastMessage: boolean;
  isCopied?: boolean;
  tokenCount?: number;
  inputTokenCount?: number;
  tokensPerSecond?: number;
  actions: ActionProps;
  meetingCitations?: MeetingCitation[];
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
  /** The reply's Read aloud (its message owns it, to highlight what's spoken). */
  readAloud: ReadAloud;
}

const AssistantActionBar: React.FC<AssistantActionBarProps> = ({
  id, text, timestamp, isLastMessage, isCopied,
  tokenCount, inputTokenCount, tokensPerSecond,
  actions, meetingCitations,
  suggestions, onSuggestionClick,
  citationHandlers, webCitations, readAloud,
}) => {
  const { onCopy } = actions;
  const { onCitationClick, onShowAllMeetingCitations, onShowAllWebCitations } = citationHandlers;

  const hasSuggestions = !!(suggestions && suggestions.length > 0 && onSuggestionClick && isLastMessage);
  const hasMeetingCitations = !!(meetingCitations && meetingCitations.length > 0);
  const hasWebCitations = !!(webCitations && webCitations.length > 0);
  const hasCitations = hasMeetingCitations || hasWebCitations;
  const hasTabs = hasSuggestions || hasCitations;

  const [activeTab, setActiveTab] = useState<'suggestions' | 'sources'>(
    hasSuggestions ? 'suggestions' : 'sources'
  );

  // Reset when available tabs change, or 'sources' is orphaned after suggestions clear.
  useEffect(() => {
    if (hasSuggestions) setActiveTab('suggestions');
    else if (hasCitations) setActiveTab('sources');
  }, [hasSuggestions, hasCitations]);

  const tabItems = [
    { value: 'suggestions' as const, label: 'Suggestions' },
    ...(hasCitations ? [{ value: 'sources' as const, label: 'Sources' }] : []),
  ];

  return (
    <>
      <Separator className="mt-4 mb-3" />

      {/* Action bar */}
      <div className="flex items-center gap-2">
        {/* Left: tabs or solo buttons */}
        {hasTabs && (
          <div className="flex items-center gap-2">
            {hasSuggestions ? (
              <Tabs items={tabItems} value={activeTab} onValueChange={setActiveTab} fill={false} />
            ) : (
              <div className="flex items-center gap-2">
                {hasMeetingCitations && (
                  <Button variant="outline" size="sm" onClick={() => onShowAllMeetingCitations?.(meetingCitations)}>
                    <Dot tone="info" size="xs" />
                    {meetingCitations.length} {meetingCitations.length === 1 ? 'Meeting' : 'Meetings'}
                  </Button>
                )}
                {hasWebCitations && (
                  <Button variant="outline" size="sm" onClick={() => onShowAllWebCitations?.(webCitations)}>
                    <Dot tone="success" size="xs" />
                    {webCitations.length} Web Search
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right: icons */}
        <div className="ml-auto flex items-center gap-2">
          {/* Token usage reads on hover only, so it is offered where there is hover (not on touch). */}
          {!platform.hasTouchScreen && (tokensPerSecond != null || tokenCount != null || inputTokenCount != null) && (
            <Tooltip
              content={[
                tokensPerSecond != null && `${tokensPerSecond} tok/s`,
                [inputTokenCount != null && `${inputTokenCount} in`, tokenCount != null && `${tokenCount} out`].filter(Boolean).join(' / '),
              ].filter(Boolean).join(' · ')}
            >
              <IconButton icon={Gauge} label="Token usage" size="sm" />
            </Tooltip>
          )}
          {onCopy && (
            <IconButton icon={isCopied ? Check : Copy} label="Copy message" size="sm" onClick={() => onCopy(id, text)} />
          )}
          {platform.hasLocalModels && (
            <IconButton
              icon={READ_ALOUD_ICON[readAloud.state]}
              spin={readAloud.state === 'preparing'}
              label={readAloud.state === 'idle' ? 'Read aloud' : 'Stop reading'}
              size="sm"
              onClick={readAloud.toggle}
            />
          )}
          {timestamp && (
            <Text variant="caption" tone="faint">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </div>
      </div>

      {/* Tab content: suggestions, or sources when expanded via the tab */}
      {hasTabs && hasSuggestions && (
        <div className="flex flex-col gap-1 mt-2.5">
          {activeTab === 'suggestions' && (
            <SuggestionsList suggestions={suggestions!} onSuggestionClick={onSuggestionClick!} />
          )}
          {activeTab === 'sources' && hasCitations && (
            <SourcesList
              meetingCitations={meetingCitations}
              webCitations={webCitations}
              onCitationClick={onCitationClick}
              onShowAllMeetingCitations={onShowAllMeetingCitations}
              onShowAllWebCitations={onShowAllWebCitations}
            />
          )}
        </div>
      )}
    </>
  );
};

export default AssistantActionBar;
