import React from 'react';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { MediaPartRenderer } from '../MediaPartRenderer';
import ToolCallBlock from './ToolCallBlock';
import ToolCallSummary from './ToolCallSummary';
import type { ChatPart, WebCitation } from '@/types';

interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Optional: transforms text before rendering (e.g. citation injection) */
  processText?: (text: string) => string;
  /** Passed to StreamingMarkdown for inline citation rendering */
  webCitations?: WebCitation[];
}

/** Iterates over message parts, rendering text via StreamingMarkdown and media via MediaPartRenderer */
const PartsList: React.FC<PartsListProps> = ({ parts, messageId, streaming, processText, webCitations }) => {
  // Separate tool_call parts from other parts
  const toolCallParts = parts.filter((part): part is Extract<ChatPart, { type: 'tool_call' }> => part.type === 'tool_call');
  const nonToolParts = parts.filter(part => part.type !== 'tool_call');
  
  return (
    <>
      {/* Render tool calls: individual blocks while streaming, summary when finalized */}
      {toolCallParts.length > 0 && (
        streaming ? (
          toolCallParts.map(part => <ToolCallBlock key={part.toolCallId} part={part} />)
        ) : (
          <ToolCallSummary parts={toolCallParts} />
        )
      )}

      {nonToolParts.map((part, index) => {
        if (part.type === 'text') {
          const text = processText ? processText(part.text) : part.text;
          if (!text) return null;
          return (
            <StreamingMarkdown
              key={index}
              content={text}
              streaming={streaming}
              messageId={messageId}
              webCitations={webCitations}
            />
          );
        }
        return <MediaPartRenderer key={index} part={part} />;
      })}
    </>
  );
};

export default PartsList;
