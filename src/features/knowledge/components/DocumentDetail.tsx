/** A document in Knowledge's pane: its name, kind · size · day and indexing state (why, when it couldn't be read), its pages
 *  or words; its item actions — ✦ Ask, ⤢ Open in its own window (iPhone: full screen), ⋯ Delete. */

import React from 'react';
import { Maximize2 } from 'lucide-react';
import { FileTypeIcon, StateBadge, Surface, Text } from '@shared/ui';
import { ItemActions } from '@shared/components';
import { platform } from '@platform/index';
import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { LAYOUT } from '@config/layout.config';
import { KNOWLEDGE_LIBRARY, READER } from '@config/knowledgeLibrary.config';
import { MENU_SYMBOLS } from '@config/ui.config';
import { openReader } from '@features/knowledge/reader';
import { DocumentBody } from './DocumentBody';
import { documentFacts, indexingOf } from './documentFacts';

interface DocumentDetailProps {
  document: KnowledgeDocument;
  status: SourceStatus | undefined;
  onDelete: () => void;
}

export const DocumentDetail: React.FC<DocumentDetailProps> = ({ document, status, onDelete }) => {
  const indexing = indexingOf(status);
  const read = (asking: boolean) => openReader({ path: document.appPath, asking }, document.name);
  const actions = (placement: 'header' | 'bottom') => (
    <ItemActions
      placement={placement}
      onAsk={() => read(true)}
      actions={[{ icon: Maximize2, label: platform.hasWindowChrome ? READER.open : READER.openPhone, onPress: () => read(false) }]}
      more={[{ type: 'item', label: KNOWLEDGE_LIBRARY.delete, symbol: MENU_SYMBOLS.delete, destructive: true, onSelect: onDelete }]}
    />
  );
  return (
    <article className="flex h-full flex-col">
      <Surface as="header" edge="bottom" className={`flex items-center gap-3 ${LAYOUT.listGutter} py-3`}>
        <FileTypeIcon name={document.name} size="md" />
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="title" truncate>{document.name}</Text>
          <span className="flex flex-wrap items-center gap-2">
            <Text variant="helper" tone="muted">{documentFacts(document)}</Text>
            <StateBadge state={indexing.state}>{indexing.label}</StateBadge>
          </span>
          {status?.error && <Text variant="helper" tone="muted">{status.error}</Text>}
        </div>
        {actions('header')}
      </Surface>
      <div className={`min-h-0 flex-1 overflow-y-auto ${LAYOUT.listGutter} py-4`}>
        <DocumentBody document={document} />
      </div>
      {actions('bottom')}
    </article>
  );
};
