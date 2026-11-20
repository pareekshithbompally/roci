import React from 'react';
import { Markdown } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import type { WebCitation, ChatPart } from '@shared/types';
import type { GenerationStats } from '@services/ai/types';
import { ActivityRun } from './ActivityRun';
import { groupActivity, type PartSegment } from './groupActivity';

interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Optional: transforms text before rendering (e.g. citation injection) */
  processText?: (text: string) => string;
  /** Passed to Markdown for inline citation rendering */
  webCitations?: WebCitation[];
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation?: GenerationStats | null;
}

/** A message's parts in order; each run of the model's work shows under one folded header. */
const PartsList: React.FC<PartsListProps> = ({ parts, messageId, streaming, processText, webCitations, generation }) => {
  const { settings } = useSettings();
  const liveIndex = streaming ? parts.length - 1 : null;

  const render = (segment: PartSegment) => {
    if (segment.kind === 'activity') {
      const items = settings.hideToolCalls ? segment.items.filter(({ part }) => part.type !== 'tool_call') : segment.items;
      if (items.length === 0) return null;
      return <ActivityRun key={`run-${items[0].index}`} items={items} liveIndex={liveIndex} generation={generation} />;
    }
    const { part, index } = segment.item;
    if (part.type === 'text') {
      const text = processText ? processText(part.text) : part.text;
      if (!text) return null;
      return <Markdown key={index} content={text} streaming={streaming} messageId={messageId} webCitations={webCitations} />;
    }
    return <MediaPartRenderer key={index} part={part} />;
  };

  return <>{groupActivity(parts).map(render)}</>;
};

export default PartsList;
