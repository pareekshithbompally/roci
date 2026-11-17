/** Phone (iOS): the chat's thinking level and tools as plain rows with switches — the same catalog as the Mac Tools picker. */

import React from 'react';
import { Globe, ImageIcon, Library, Lightbulb, type LucideIcon } from 'lucide-react';
import { CardRow, ChoiceControl, Icon, Section, Switch } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { CHAT_REASONING_COPY, REASONING_EFFORT_LEVELS } from '@config/chat.config';
import { useToolCatalog } from '@features/chat/hooks';
import type { CatalogGroup } from '@features/chat/hooks/toolCatalog';
import { useReasoningControl } from '@features/chat/components/ReasoningPicker';

const leading = (icon: LucideIcon) => <Icon icon={icon} size="sm" />;

/** A tool group (Roci's own, or a connected server): one switch for all its tools. */
const GroupRow: React.FC<{ group: CatalogGroup; icon?: LucideIcon; onChange: (on: boolean) => void }> = ({ group, icon, onChange }) => (
  <CardRow
    title={group.label}
    leading={icon ? leading(icon) : <ServerIcon name={group.label} icon={group.icon} />}
    actions={<Switch size="sm" checked={group.enabledCount > 0} onCheckedChange={onChange} aria-label={group.label} />}
  />
);

interface ChatToolRowsProps {
  /** Opens Settings at Capabilities (an image model is chosen there). */
  onChooseImageModel: () => void;
}

export const ChatToolRows: React.FC<ChatToolRowsProps> = ({ onChooseImageModel }) => {
  const catalog = useToolCatalog();
  const reasoning = useReasoningControl();
  const { webSearch, imageGeneration, modelSupportsTools } = catalog;
  const servers = catalog.servers.filter((g) => g.status === 'connected' && g.tools.length > 0);

  return (
    <Section title="Chat" footer={!modelSupportsTools && catalog.modelName ? `${catalog.modelName} can’t use tools. Pick a model with tool calling.` : undefined}>
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
        actions={<Switch size="sm" checked={webSearch.enabled} disabled={!webSearch.available} onCheckedChange={webSearch.toggle} aria-label="Web search" />}
      />
      {modelSupportsTools && (imageGeneration.available ? (
        <CardRow
          title="Image generation"
          description={`via ${imageGeneration.modelLabel}`}
          leading={leading(ImageIcon)}
          actions={<Switch size="sm" checked={imageGeneration.enabled} onCheckedChange={imageGeneration.toggle} aria-label="Image generation" />}
        />
      ) : (
        <CardRow title="Image generation" description="Choose an image model" leading={leading(ImageIcon)} onOpen={onChooseImageModel} />
      ))}
      {modelSupportsTools && catalog.builtIn.tools.length > 0 && (
        <GroupRow group={catalog.builtIn} icon={Library} onChange={(on) => catalog.setGroupEnabled(catalog.builtIn, on)} />
      )}
      {modelSupportsTools && servers.map((group) => (
        <GroupRow key={group.key} group={group} onChange={(on) => catalog.setGroupEnabled(group, on)} />
      ))}
    </Section>
  );
};
