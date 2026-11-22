/** Phone (iOS): the chat's thinking level and tools as plain rows with switches — the same catalog as the Mac Tools picker. */

import React from 'react';
import { ChartColumn, Globe, ImageIcon, Library, Lightbulb, type LucideIcon } from 'lucide-react';
import { CardRow, ChoiceControl, ContextRing, Icon, Section, Switch, Text } from '@shared/ui';
import type { ContextUsage } from '@shared/hooks/useContextUsage';
import { ServerIcon } from '@shared/components';
import { CHAT_REASONING_COPY, REASONING_EFFORT_LEVELS } from '@config/chat.config';
import { TOOLS_MENU_COPY } from '@config/chatTools.config';
import type { ToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup } from '@features/chat/hooks/toolCatalog';
import { useReasoningControl } from '@features/chat/components/ReasoningPicker';
import { toolsShare } from './toolsShare';

const leading = (icon: LucideIcon) => <Icon icon={icon} size="sm" />;

/** A tool group (Roci's own, or a connected server): one switch for all its tools. */
const GroupRow: React.FC<{ group: CatalogGroup; icon?: LucideIcon; onChange: (on: boolean) => void }> = ({ group, icon, onChange }) => (
  <CardRow
    title={group.label}
    leading={icon ? leading(icon) : <ServerIcon name={group.label} icon={group.icon} />}
    actions={<Switch checked={group.enabledCount > 0} onCheckedChange={onChange} aria-label={group.label} />}
  />
);

interface ChatToolRowsProps {
  /** The composer's one tool catalog. */
  catalog: ToolCatalog;
  /** Opens Settings at Default Models (an image model is chosen there). */
  onChooseImageModel: () => void;
  /** How full the chat's context window is; the row shows once it is known. */
  contextUsage?: ContextUsage | null;
}

export const ChatToolRows: React.FC<ChatToolRowsProps> = ({ catalog, onChooseImageModel, contextUsage }) => {
  const reasoning = useReasoningControl();
  const { webSearch, imageGeneration, resultViews, modelSupportsTools } = catalog;
  const servers = catalog.servers.filter((g) => g.status === 'connected' && g.tools.length > 0);

  return (
    <Section title="Chat" footer={!modelSupportsTools && catalog.modelName ? `${catalog.modelName} can’t use tools. Pick a model with tool calling.` : undefined}>
      {/* The ring opens the breakdown; the value says how full the window is. */}
      {contextUsage && (
        <CardRow
          title="Context"
          leading={<ContextRing usage={contextUsage} tools={toolsShare(catalog)} />}
          actions={<Text tone="muted">{`${contextUsage.percent}% used`}</Text>}
        />
      )}
      {reasoning && (
        <CardRow
          title={CHAT_REASONING_COPY.control}
          leading={leading(Lightbulb)}
          actions={
            <ChoiceControl label={CHAT_REASONING_COPY.control} items={REASONING_EFFORT_LEVELS} value={reasoning.effort} onValueChange={reasoning.setEffort} />
          }
        />
      )}
      <CardRow
        title="Web search"
        description={webSearch.available ? `via ${webSearch.providerLabel}` : 'Not available for this model'}
        leading={leading(Globe)}
        actions={<Switch checked={webSearch.enabled} disabled={!webSearch.available} onCheckedChange={webSearch.toggle} aria-label="Web search" />}
      />
      {modelSupportsTools && (imageGeneration.available ? (
        <CardRow
          title="Image generation"
          description={`via ${imageGeneration.modelLabel}`}
          leading={leading(ImageIcon)}
          actions={<Switch checked={imageGeneration.enabled} onCheckedChange={imageGeneration.toggle} aria-label="Image generation" />}
        />
      ) : (
        <CardRow title="Image generation" description="Choose an image model" leading={leading(ImageIcon)} onOpen={onChooseImageModel} />
      ))}
      {modelSupportsTools && (
        <CardRow
          title={TOOLS_MENU_COPY.resultViews}
          description={TOOLS_MENU_COPY.resultViewsHint}
          leading={leading(ChartColumn)}
          actions={<Switch checked={resultViews.enabled} onCheckedChange={resultViews.toggle} aria-label={TOOLS_MENU_COPY.resultViews} />}
        />
      )}
      {modelSupportsTools && catalog.builtIn.tools.length > 0 && (
        <GroupRow group={catalog.builtIn} icon={Library} onChange={(on) => catalog.setGroupEnabled(catalog.builtIn, on)} />
      )}
      {modelSupportsTools && servers.map((group) => (
        <GroupRow key={group.key} group={group} onChange={(on) => catalog.setGroupEnabled(group, on)} />
      ))}
    </Section>
  );
};
