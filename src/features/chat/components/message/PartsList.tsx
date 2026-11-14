import React from 'react';
import { Markdown } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { ToolCallBlock } from '@features/chat/components/tool-call';
import type { ChatPart, WebCitation } from '@shared/types';

interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Optional: transforms text before rendering (e.g. citation injection) */
  processText?: (text: string) => string;
  /** Passed to Markdown for inline citation rendering */
  webCitations?: WebCitation[];
}

/**
 * Renders a message's parts in the order they happened: text, media and one
 * collapsible block per tool call (the running call is open).
 */
const PartsList: React.FC<PartsListProps> = ({ parts, messageId, streaming, processText, webCitations }) => {
  const { settings } = useSettings();

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'tool_call') {
          if (settings.hideToolCalls) return null;
          return <ToolCallBlock key={part.toolCallId} part={part} />;
        }
        if (part.type === 'text') {
          const text = processText ? processText(part.text) : part.text;
          if (!text) return null;
          return (
            <Markdown key={index} content={text} streaming={streaming} messageId={messageId} webCitations={webCitations} />
          );
        }
        return <MediaPartRenderer key={index} part={part} />;
      })}
    </>
  );
};

export default PartsList;
