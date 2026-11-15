import React from 'react';
import { Markdown } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { ToolCallBlock, ToolCallGroup, groupToolCalls, type PartSegment } from '@features/chat/components/tool-call';
import type { WebCitation, ChatPart } from '@shared/types';

interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Optional: transforms text before rendering (e.g. citation injection) */
  processText?: (text: string) => string;
  /** Passed to Markdown for inline citation rendering */
  webCitations?: WebCitation[];
}

/** A message's parts in order; back-to-back tool calls render as one group. */
const PartsList: React.FC<PartsListProps> = ({ parts, messageId, streaming, processText, webCitations }) => {
  const { settings } = useSettings();

  const render = (segment: PartSegment) => {
    if (segment.kind === 'tools') {
      if (settings.hideToolCalls) return null;
      const [first] = segment.parts;
      return segment.parts.length === 1
        ? <ToolCallBlock key={first.toolCallId} part={first} />
        : <ToolCallGroup key={first.toolCallId} parts={segment.parts} />;
    }
    const { part, index } = segment;
    if (part.type === 'text') {
      const text = processText ? processText(part.text) : part.text;
      if (!text) return null;
      return <Markdown key={index} content={text} streaming={streaming} messageId={messageId} webCitations={webCitations} />;
    }
    return <MediaPartRenderer key={index} part={part} />;
  };

  return <>{groupToolCalls(parts).map(render)}</>;
};

export default PartsList;
