import React, { useEffect, useRef } from 'react';
import { TEXT, SURFACE, BORDER } from '@config/theme.config';
import type { ChatPart } from '@/types';

type ToolCallPart = Extract<ChatPart, { type: 'tool_call' }>;

interface ToolActivityTraceProps {
  parts: ToolCallPart[];
}

/**
 * Single-box tool content display — shows only the CURRENT tool's result.
 * No header (tool name is already shown inline in the message header).
 * Content scrolls vertically within a fixed-height box.
 */
const ToolActivityTrace: React.FC<ToolActivityTraceProps> = ({ parts }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const current = parts.find(p => p.status === 'calling') || parts[parts.length - 1];
  if (!current) return null;

  const isError = current.status === 'error';
  const content = current.result?.content;

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`max-h-[120px] overflow-y-auto rounded-lg border ${BORDER.subtle} ${SURFACE.inset} mb-2 px-3 py-2`}
    >
      {content ? (
        <pre className={`text-[11px] ${isError ? 'text-red-500/70' : TEXT.faint} whitespace-pre-wrap break-all font-sans`}>
          {content}
        </pre>
      ) : (
        <span className={`text-[11px] ${TEXT.faint} animate-pulse`}>...</span>
      )}
    </div>
  );
};

export default ToolActivityTrace;
