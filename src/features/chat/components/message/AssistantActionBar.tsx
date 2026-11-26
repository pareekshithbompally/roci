import React, { useState, useEffect } from 'react';
import { formatDayAndTime } from '@shared/utils/formatters';
import { Copy, Check, Loader2, MoreHorizontal, Square, Volume2 } from 'lucide-react';
import type { ReadAloud, ReadAloudState } from '@shared/hooks/useReadAloud';
import SuggestionsList from './SuggestionsList';
import SourcesList from './SourcesList';
import type { ActionProps, CitationHandlers } from './types';
import type { ContextTokens, MeetingCitation, WebCitation } from '@shared/types';
import { Tabs, Button, CardRow, IconButton, Popover, PopoverContent, PopoverTrigger, Section, Separator, Dot, Text } from '@shared/ui';
import { ModelIcon } from '@shared/components';
import { useModelLabel } from '@shared/hooks/useModelLabel';
import { CHAT_MESSAGE_MENU_COPY as MENU_COPY } from '@config/chat.config';
import { platform } from '@platform/index';

/** Read aloud's glyph: speaker, then a spinner while the voice gets ready, then stop. */
const READ_ALOUD_ICON: Record<ReadAloudState, typeof Volume2> = { idle: Volume2, preparing: Loader2, speaking: Square };

/** What the reply's ⋯ menu tells: when it was written, by which model, and its speed and cost. */
interface ReplyDetails {
  timestamp?: number;
  provider?: string;
  model?: string;
  /** The reply's share of the context window: its last call's prompt and reply. */
  context?: ContextTokens;
  tokensPerSecond?: number;
  /** What the reply cost ("$0.0031", "Free", "no price"); null when it recorded no tokens. */
  cost?: string | null;
}

interface DetailRow {
  title: string;
  value: string;
}

/** The reply's ⋯: a details card (as Messages and Gemini show a message's info): the model's logo and name with when it
 *  wrote, then its speed, tokens and cost as rows. A popover on a Mac, a sheet on iPhone. */
const ReplyDetailsMenu: React.FC<ReplyDetails> = ({ timestamp, provider, model, context, tokensPerSecond, cost }) => {
  const modelLabel = useModelLabel(provider, model);
  const rows = ([
    tokensPerSecond != null && { title: MENU_COPY.speed, value: MENU_COPY.tokensPerSecond(tokensPerSecond) },
    context && { title: MENU_COPY.tokens, value: MENU_COPY.tokensInOut(context.prompt, context.reply) },
    cost && { title: MENU_COPY.cost, value: cost },
  ] as (DetailRow | false | null | undefined | '')[]).filter((row): row is DetailRow => !!row);
  if (!modelLabel && !timestamp && rows.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton icon={MoreHorizontal} label={MENU_COPY.details} size="sm" />
      </PopoverTrigger>
      <PopoverContent label={MENU_COPY.details} align="start" className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-3">
          {provider && <ModelIcon provider={provider} modelId={model} />}
          <div className="min-w-0">
            {modelLabel && <Text as="p" variant="headline" truncate>{modelLabel}</Text>}
            {timestamp && <Text as="p" variant="helper" tone="muted">{formatDayAndTime(timestamp)}</Text>}
          </div>
        </div>
        {rows.length > 0 && <Section>{rows.map((row) => <CardRow key={row.title} title={row.title} value={row.value} />)}</Section>}
      </PopoverContent>
    </Popover>
  );
};

interface AssistantActionBarProps extends ReplyDetails {
  id: string;
  text: string;
  isLastMessage: boolean;
  isCopied?: boolean;
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
  id, text, isLastMessage, isCopied,
  actions, meetingCitations,
  suggestions, onSuggestionClick,
  citationHandlers, webCitations, readAloud, ...details
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
              // One section is a label, not a lone segment; Sources beside it makes it a choice.
              tabItems.length > 1
                ? <Tabs items={tabItems} value={activeTab} onValueChange={setActiveTab} fill={false} />
                : <Text variant="label" tone="faint">{tabItems[0].label}</Text>
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
          <ReplyDetailsMenu {...details} />
        </div>
      </div>

      {/* Tab content: suggestions, or sources when expanded via the tab */}
      {hasTabs && hasSuggestions && (
        <div className="flex flex-col mt-2">
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
