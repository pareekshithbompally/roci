import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, Gauge } from 'lucide-react';
import ActionButton from './ActionButton';
import SuggestionsList from './SuggestionsList';
import SourcesList from './SourcesList';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { ActionProps, CitationHandlers } from './types';
import type { MeetingCitation, WebCitation } from '@/types';

interface AssistantActionBarProps {
  id: string;
  text: string;
  timestamp?: number;
  isLastMessage: boolean;
  isCopied?: boolean;
  tokenCount?: number;
  tokensPerSecond?: number;
  actions: ActionProps;
  meetingCitations?: MeetingCitation[];
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  citationHandlers: CitationHandlers;
  webCitations?: WebCitation[];
}

const AssistantActionBar: React.FC<AssistantActionBarProps> = ({
  id, text, timestamp, isLastMessage, isCopied,
  tokenCount, tokensPerSecond,
  actions, meetingCitations,
  suggestions, onSuggestionClick,
  citationHandlers, webCitations,
}) => {
  const { onCopy, onRerun } = actions;
  const { onCitationClick, onShowAllWebCitations } = citationHandlers;

  const hasSuggestions = !!(suggestions && suggestions.length > 0 && onSuggestionClick && isLastMessage);
  const hasMeetingCitations = !!(meetingCitations && meetingCitations.length > 0);
  const hasWebCitations = !!(webCitations && webCitations.length > 0);
  const hasCitations = hasMeetingCitations || hasWebCitations;
  const hasTabs = hasSuggestions || hasCitations;

  const [activeTab, setActiveTab] = useState<'suggestions' | 'sources'>(
    hasSuggestions ? 'suggestions' : 'sources'
  );

  useEffect(() => {
    if (hasSuggestions) setActiveTab('suggestions');
  }, [hasSuggestions]);

  const tabClass = (tab: string) =>
    `px-3 py-1 text-xs font-medium rounded transition-all ${
      activeTab === tab
        ? `${SURFACE.card} ${TEXT.primary} shadow-sm`
        : `${TEXT.faint} hover:text-parchment-800 dark:hover:text-night-300`
    }`;

  return (
    <>
      {/* Separator */}
      <div className={`border-t ${BORDER.subtle} mt-4 mb-3`} />

      {/* Action bar */}
      <div className="flex items-center gap-2">
        {/* Left: tabs */}
        {hasTabs && (
          <div className={`flex items-center ${SURFACE.inset} rounded-md p-0.5`}>
            {hasSuggestions && <button onClick={() => setActiveTab('suggestions')} className={tabClass('suggestions')}>Suggestions</button>}
            {hasCitations && <button onClick={() => setActiveTab('sources')} className={tabClass('sources')}>Sources</button>}
          </div>
        )}

        {/* Right: icons */}
        <div className="ml-auto flex items-center gap-2">
          {(tokensPerSecond != null || tokenCount != null) && (
            <div className={`flex items-center gap-1.5 ${TEXT.faint}`}>
              <Gauge className="w-4 h-4" />
              <span className="text-xs">
                {tokensPerSecond != null ? `${tokensPerSecond} tok/s` : ''}
                {tokensPerSecond != null && tokenCount != null ? ' · ' : ''}
                {tokenCount != null ? `${tokenCount} tok` : ''}
              </span>
            </div>
          )}
          {onRerun && isLastMessage && (
            <ActionButton onClick={onRerun} title="Regenerate response">
              <RefreshCw className="w-4 h-4" />
            </ActionButton>
          )}
          {onCopy && (
            <ActionButton onClick={() => onCopy(id, text)} title="Copy message" active={isCopied}>
              {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </ActionButton>
          )}
          {timestamp && (
            <span className={`text-[11px] ${TEXT.faint}`}>
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Tab content */}
      {hasTabs && (
        <div className="flex flex-col gap-1 mt-2.5">
          {activeTab === 'suggestions' && hasSuggestions && (
            <SuggestionsList suggestions={suggestions!} onSuggestionClick={onSuggestionClick!} />
          )}
          {activeTab === 'sources' && hasCitations && (
            <SourcesList
              meetingCitations={meetingCitations}
              webCitations={webCitations}
              onCitationClick={onCitationClick}
              onShowAllWebCitations={onShowAllWebCitations}
            />
          )}
        </div>
      )}
    </>
  );
};

export default AssistantActionBar;
