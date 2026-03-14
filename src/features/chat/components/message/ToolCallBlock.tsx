import React, { useState } from 'react';
import { ChevronRight, Loader2, Wrench, AlertCircle } from 'lucide-react';
import { toolLabel } from '@shared/utils/toolUtils';
import { TEXT, SURFACE, BORDER } from '@config/theme.config';
import type { ChatPart } from '@/types';

type ToolCallPart = Extract<ChatPart, { type: 'tool_call' }>;

interface ToolCallBlockProps {
  part: ToolCallPart;
}

const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ part }) => {
  const [expanded, setExpanded] = useState(false);
  const { toolName, status, arguments: args, result } = part;

  const label = toolLabel(toolName, status);
  const isCalling = status === 'calling';
  const isError = status === 'error';
  const isComplete = status === 'complete';
  const hasBody = (isComplete || isError) && (Object.keys(args).length > 0 || result);

  return (
    <div className={`my-1.5 rounded-lg border ${BORDER.subtle} ${SURFACE.inset} overflow-hidden`}>
      <button
        onClick={() => hasBody && setExpanded(e => !e)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left ${hasBody ? 'cursor-pointer' : 'cursor-default'}`}
        disabled={!hasBody}
      >
        {hasBody && (
          <ChevronRight
            className={`w-3.5 h-3.5 ${TEXT.faint} flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          />
        )}

        {isCalling && <Loader2 className={`w-3.5 h-3.5 ${TEXT.muted} flex-shrink-0 animate-spin`} />}
        {isComplete && <Wrench className={`w-3.5 h-3.5 ${TEXT.faint} flex-shrink-0`} />}
        {isError && <AlertCircle className={`w-3.5 h-3.5 text-red-500 flex-shrink-0`} />}

        <span className={`text-[13px] ${TEXT.muted}`}>{label}</span>

        {result?.executionMs != null && (
          <span className={`text-[11px] ${TEXT.faint} ml-auto`}>
            {result.executionMs < 1000
              ? `${result.executionMs}ms`
              : `${(result.executionMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </button>

      {expanded && hasBody && (
        <div className={`border-t ${BORDER.subtle} px-3 py-2 space-y-2`}>
          {Object.keys(args).length > 0 && (
            <div>
              <p className={`text-[11px] font-medium ${TEXT.faint} uppercase tracking-wide mb-1`}>Parameters</p>
              <pre className={`text-xs ${TEXT.secondary} whitespace-pre-wrap break-all`}>
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <p className={`text-[11px] font-medium ${TEXT.faint} uppercase tracking-wide mb-1`}>Result</p>
              <pre className={`text-xs ${result.isError ? 'text-red-500' : TEXT.secondary} whitespace-pre-wrap break-all max-h-48 overflow-y-auto`}>
                {result.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallBlock;
