import React from 'react';
import { Markdown } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { MediaPartRenderer } from '@features/chat/components/MediaPartRenderer';
import { McpAppView } from '@features/chat/components/McpAppView';
import type { ChatPart } from '@shared/types';
import type { GenerationStats } from '@services/ai/types';
import { ActivityRun } from './ActivityRun';
import { groupActivity, liveIndexOf, type PartSegment } from './groupActivity';

interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation?: GenerationStats | null;
  /** Sends text as the user's next message (an MCP App screen's `ui/message`). */
  onSend?: (text: string) => void;
}

/** A message's parts in order; each run of the model's work shows under one folded header. */
const PartsList: React.FC<PartsListProps> = ({ parts, messageId, streaming, generation, onSend }) => {
  const { settings } = useSettings();
  const segments = groupActivity(parts);
  const liveIndex = streaming ? liveIndexOf(segments) : null;

  const render = (segment: PartSegment) => {
    if (segment.kind === 'activity') {
      const items = settings.hideToolCalls ? segment.items.filter(({ part }) => part.type !== 'tool_call') : segment.items;
      if (items.length === 0) return null;
      return <ActivityRun key={`run-${items[0].key}`} items={items} liveIndex={liveIndex} generation={generation} />;
    }
    if (segment.kind === 'media') return <MediaPartRenderer key={`media-${segment.item.key}`} media={segment.item.part} />;
    if (segment.kind === 'app') return <McpAppView key={`app-${segment.item.key}`} app={segment.item.part.app} title={segment.item.part.title} onSend={onSend} />;
    return <Markdown key={segment.item.key} content={segment.item.part} streaming={streaming} messageId={messageId} />;
  };

  return <>{segments.map(render)}</>;
};

export default PartsList;
