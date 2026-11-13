import React, { useState } from 'react';
import { ChevronRight, Wrench, AlertCircle } from 'lucide-react';
import { toolLabel } from '@shared/utils/toolUtils';
import { TEXT, SURFACE, BORDER } from '@config/theme.config';
import type { ChatPart } from '@shared/types';
import { ServerIcon } from '@shared/components/ServerIcon';
import { useMcpServerInfo } from '@features/settings/hooks';

type ToolCallPart = Extract<ChatPart, { type: 'tool_call' }>;

interface ToolCallSummaryProps {
  parts: ToolCallPart[];
}

const ToolCallSummary: React.FC<ToolCallSummaryProps> = ({ parts }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: serverInfo } = useMcpServerInfo();
  // One MCP server behind every call → lead with its icon instead of the generic wrench.
  const sources = new Set(parts.map((p) => p.source));
  const sharedSource = sources.size === 1 ? parts[0].source : undefined;
  
  // Group by tool type and count
  const toolCounts = parts.reduce((acc, part) => {
    const key = part.toolName;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate total execution time
  const totalExecutionMs = parts.reduce((sum, part) => {
    return sum + (part.result?.executionMs || 0);
  }, 0);

  // Count errors
  const errorCount = parts.filter(part => part.status === 'error').length;
  const hasErrors = errorCount > 0;

  return (
    <div className={`my-1.5 rounded-lg border ${BORDER.subtle} ${SURFACE.inset} overflow-hidden`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left cursor-pointer`}
      >
        <ChevronRight
          className={`w-3.5 h-3.5 ${TEXT.faint} flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />

        {hasErrors ? (
          <AlertCircle className={`w-3.5 h-3.5 text-red-500 flex-shrink-0`} />
        ) : sharedSource ? (
          <ServerIcon name={sharedSource} icon={serverInfo?.get(sharedSource)?.icon} />
        ) : (
          <Wrench className={`w-3.5 h-3.5 ${TEXT.faint} flex-shrink-0`} />
        )}

        <span className={`text-[13px] ${TEXT.muted}`}>
          {parts.length === 1 ? (
            toolLabel(parts[0].toolName, parts[0].status, parts[0].source)
          ) : (
            Object.entries(toolCounts).map(([toolName, count], index) => (
              <React.Fragment key={toolName}>
                {index > 0 && ' · '}
                {toolLabel(toolName, 'complete', parts.find((p) => p.toolName === toolName)?.source)} ×{count}
              </React.Fragment>
            )
          ))}
        </span>

        {totalExecutionMs > 0 && (
          <span className={`text-[11px] ${TEXT.faint} ml-auto`}>
            {totalExecutionMs < 1000
              ? `${Math.round(totalExecutionMs)}ms`
              : `${(totalExecutionMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </button>

      {expanded && (
        <div className={`border-t ${BORDER.subtle} px-3 py-2 space-y-2 max-h-48 overflow-y-auto`}>
          {parts.map((part) => (
            <div key={part.toolCallId} className="text-xs space-y-1">
              <div className={`flex items-center gap-1.5 font-medium ${TEXT.secondary}`}>
                {part.source && <ServerIcon name={part.source} icon={serverInfo?.get(part.source)?.icon} className="w-3 h-3" />}
                {toolLabel(part.toolName, part.status, part.source)}
              </div>
              {part.result?.executionMs && (
                <div className={`text-[11px] ${TEXT.faint}`}>
                  {part.result.executionMs < 1000
                    ? `${Math.round(part.result.executionMs)}ms`
                    : `${(part.result.executionMs / 1000).toFixed(1)}s`}
                </div>
              )}
              {part.result?.content && (
                <pre className={`text-xs ${part.result.isError ? 'text-red-500' : TEXT.secondary} whitespace-pre-wrap break-all max-h-24 overflow-y-auto`}>
                  {part.result.content}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolCallSummary;
