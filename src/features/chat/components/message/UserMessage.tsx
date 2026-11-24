import React, { useMemo } from 'react';
import { isFileUIPart } from 'ai';
import { FileAudio, FileX } from 'lucide-react';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { Surface, Text, Icon } from '@shared/ui';
import { MenuArea, type ContextEntry } from '@shared/components';
import { MENU_SYMBOLS } from '@config/ui.config';
import { CHAT_MESSAGE_MENU_COPY as MENU_COPY } from '@config/chat.config';
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
    <Icon icon={removed ? FileX : FileAudio} size="xs" tone="faint" />
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

/** The question as sent; a long press (a right-click on a Mac) opens its menu: Copy. */
const UserMessage: React.FC<UserMessageProps> = ({ message, actions }) => {
  const { onCopy } = actions;
  const { id, parts, metadata: { meetingRefs } } = message;
  const text = useMemo(() => messageText({ parts }), [parts]);
  const attachments = useMemo(() => parts.filter(isFileUIPart), [parts]);
  const menu = useMemo<ContextEntry[]>(
    () => (onCopy ? [{ type: 'item', label: MENU_COPY.copy, symbol: MENU_SYMBOLS.copy, onSelect: () => onCopy(id, text) }] : []),
    [onCopy, id, text],
  );

  return (
    <div className="flex flex-col items-end max-w-[75%]">
      {/* Meeting context chips (read-only) */}
      {meetingRefs && meetingRefs.length > 0 && <MeetingChips refs={meetingRefs} />}
      <MenuArea label={MENU_COPY.question} items={menu}>
        <Surface variant="inset" radius="bubble" className="inline-block px-3.5 py-2">
          <Text as="div" variant="reading" className="max-h-[40vh] overflow-y-auto custom-scrollbar">
            {text}
          </Text>
          {/* User attachments */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((part, i) => <MediaPartRenderer key={i} media={part} />)}
            </div>
          )}
        </Surface>
      </MenuArea>
    </div>
  );
};

export default UserMessage;
