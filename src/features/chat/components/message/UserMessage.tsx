import React from 'react';
import { Copy, Check, FileAudio } from 'lucide-react';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { Surface, Text, Icon, IconButton } from '@shared/ui';
import type { UserMessageProps } from './types';

const UserMessage: React.FC<UserMessageProps> = ({ id, text, parts, meetingRefs, timestamp, isCopied, actions }) => {
  const { onCopy } = actions;

  return (
    <div className="flex flex-col items-end max-w-[75%]">
      {/* Meeting context chips (read-only) */}
      {meetingRefs && meetingRefs.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5 mb-1.5">
          {meetingRefs.map((ref) => (
            <Surface key={ref.id} variant="inset" radius="md" className="inline-flex items-center gap-1 px-2 py-0.5">
              <Icon icon={FileAudio} size="xs" tone="warning" />
              <Text variant="helper" tone="muted" truncate className="max-w-40">
                {ref.title}
              </Text>
            </Surface>
          ))}
        </div>
      )}
      <Surface variant="inset" radius="lg" className="group relative inline-block px-3.5 py-2">
        <Text as="div" variant="reading" className="max-h-[40vh] overflow-y-auto custom-scrollbar">
          {text}
        </Text>
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
          <IconButton
            icon={isCopied ? Check : Copy}
            label="Copy message"
            size="sm"
            onClick={() => onCopy(id, text)}
            className="absolute -bottom-1 -left-9 opacity-0 group-hover:opacity-100"
          />
        )}
      </Surface>

      {/* Timestamp */}
      {timestamp && (
        <Text as="div" variant="helper" tone="faint" className="mt-1">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </div>
  );
};

export default UserMessage;
