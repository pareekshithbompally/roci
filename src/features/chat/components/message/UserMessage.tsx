import React from 'react';
import { Copy, Check, FileAudio } from 'lucide-react';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { ACCENT, TEXT } from '@config/theme.config';
import type { UserMessageProps } from './types';

const UserMessage: React.FC<UserMessageProps> = ({ id, text, parts, meetingRefs, timestamp, isCopied, actions }) => {
  const { onCopy } = actions;

  return (
    <div className="flex flex-col items-end max-w-[75%]">
      {/* Meeting context chips (read-only) */}
      {meetingRefs && meetingRefs.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5 mb-1.5">
          {meetingRefs.map((ref) => (
            <div
              key={ref.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-md text-xs"
            >
              <FileAudio className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span className={`${TEXT.secondary} max-w-[150px] truncate`}>
                {ref.title}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className={`group relative inline-block ${ACCENT.userBubble} ${ACCENT.userText} px-3.5 py-2 rounded-xl`}>
        <div className={`${TYPOGRAPHY_CLASSES.chatMessage} max-h-[40vh] overflow-y-auto custom-scrollbar`}>
          {text}
        </div>
        {/* User attachments */}
        {parts && parts.filter(p => p.type !== 'text').length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {parts.filter(p => p.type !== 'text').map((part, i) => (
              <MediaPartRenderer key={i} part={part} />
            ))}
          </div>
        )}
        {/* Copy icon for user messages */}
        {onCopy && (
          <button
            onClick={() => onCopy(id, text)}
            className={`absolute -bottom-1 -left-8 p-1 ${TEXT.faint} hover:text-paper-800 dark:hover:text-night-300 rounded transition-colors opacity-0 group-hover:opacity-100`}
            title="Copy message"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Timestamp */}
      {timestamp && (
        <div className={`mt-1 ${TYPOGRAPHY_CLASSES.chatTimestamp} ${TEXT.faint}`}>
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
};

export default UserMessage;
