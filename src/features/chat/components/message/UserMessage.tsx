import React, { useMemo } from 'react';
import { isFileUIPart } from 'ai';
import { formatClockTime } from '@shared/utils/formatters';
import { Copy, Check, FileAudio, FileX } from 'lucide-react';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { HoverReveal, Surface, Text, Icon, IconButton } from '@shared/ui';
import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { StorageConfig } from '@config/storage.config';
import { messageText } from '@shared/utils/chatParts';
import type { UserMessageProps } from './types';

/** Which of a message's meetings were deleted since; none until the store answers, so a slow read never says "removed". */
function useRemovedMeetings(ids: string[]): Set<string> {
  const { data: kept } = useQuery({
    queryKey: queryKeys.meetingsExisting(ids),
    queryFn: () => store.meetings.existing(ids),
    enabled: ids.length > 0,
  });
  return useMemo(() => new Set(kept ? ids.filter((id) => !kept.includes(id)) : []), [ids, kept]);
}

/** A meeting the question was asked about; once the meeting is deleted, its chip says so. */
const MeetingChip: React.FC<{ title: string; removed: boolean }> = ({ title, removed }) => (
  <Surface variant="inset" radius="md" className="inline-flex items-center gap-1 px-2 py-0.5">
    <Icon icon={removed ? FileX : FileAudio} size="xs" tone={removed ? 'faint' : 'warning'} />
    <Text variant="helper" tone="muted" truncate className="max-w-40">
      {removed ? StorageConfig.removed.meeting : title}
    </Text>
  </Surface>
);

const MeetingChips: React.FC<{ refs: Array<{ id: string; title: string }> }> = ({ refs }) => {
  const ids = useMemo(() => refs.map((ref) => ref.id), [refs]);
  const removed = useRemovedMeetings(ids);
  return (
    <div className="flex flex-wrap justify-end gap-1.5 mb-1.5">
      {refs.map((ref) => <MeetingChip key={ref.id} title={ref.title} removed={removed.has(ref.id)} />)}
    </div>
  );
};

const UserMessage: React.FC<UserMessageProps> = ({ message, isCopied, actions }) => {
  const { onCopy } = actions;
  const { id, parts, metadata: { meetingRefs, createdAt } } = message;
  const text = useMemo(() => messageText({ parts }), [parts]);
  const attachments = useMemo(() => parts.filter(isFileUIPart), [parts]);

  return (
    <div className="flex flex-col items-end max-w-[75%]">
      {/* Meeting context chips (read-only) */}
      {meetingRefs && meetingRefs.length > 0 && <MeetingChips refs={meetingRefs} />}
      <Surface variant="inset" radius="bubble" className="group/row relative inline-block px-3.5 py-2">
        <Text as="div" variant="reading" className="max-h-[40vh] overflow-y-auto custom-scrollbar">
          {text}
        </Text>
        {/* User attachments */}
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((part, i) => <MediaPartRenderer key={i} media={part} />)}
          </div>
        )}
        {/* Copy icon for user messages */}
        {onCopy && (
          <HoverReveal className="absolute -bottom-1 -left-9">
            <IconButton icon={isCopied ? Check : Copy} label="Copy message" size="sm" onClick={() => onCopy(id, text)} />
          </HoverReveal>
        )}
      </Surface>

      {/* Timestamp */}
      <Text as="div" variant="helper" tone="faint" className="mt-1">
        {formatClockTime(createdAt)}
      </Text>
    </div>
  );
};

export default UserMessage;
