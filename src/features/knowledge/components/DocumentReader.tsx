/** A document full window: its pages (pdf.js) or words big, at the page an answer cited. Ask about this opens the chat about
 *  it beside the pages on a Mac (springing in, the pages making room) or as its own screen on iPhone; Escape or Close
 *  closes. The chat is the app's one chat, started fresh with the document attached as Search. */

import React, { useEffect } from 'react';
import { MessageSquareOff, Sparkles, X } from 'lucide-react';
import { Button, FileTypeIcon, Icon, IconButton, PageScroll, PushedPage, StateBadge, Surface, Text, TitlebarSpacer, cn, useListBesideDetail } from '@shared/ui';
import { useKnowledgeStore } from '@shared/stores/knowledgeStore';
import { ChatShell, useChatStore } from '@features/chat';
import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { LAYOUT } from '@config/layout.config';
import { KNOWLEDGE_LIBRARY, READER } from '@config/knowledgeLibrary.config';
import { DocumentBody } from './DocumentBody';

interface DocumentReaderProps {
  document: KnowledgeDocument;
  status: SourceStatus | undefined;
  facts: string;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document, status, facts }) => {
  const reading = useKnowledgeStore((s) => s.reading);
  const read = useKnowledgeStore((s) => s.read);
  const beside = useListBesideDetail();
  const asking = reading?.asking ?? false;
  const indexing = KNOWLEDGE_LIBRARY.states[status?.state ?? 'pending'];

  const close = () => read(null);
  const ask = (on: boolean) => {
    if (on) useChatStore.getState().startDocumentChat({ name: document.name, mediaType: document.mediaType, appPath: document.appPath });
    read({ key: document.id, page: reading?.page, asking: on });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && read(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [read]);

  const chat = <ChatShell placeholder={READER.chatPlaceholder} />;
  return (
    <Surface variant="page" className="fixed inset-0 z-modal flex flex-col animate-content-show">
      <TitlebarSpacer />
      <Surface as="header" edge="bottom" className={`flex items-center gap-3 ${LAYOUT.listGutter} pb-3`}>
        <FileTypeIcon name={document.name} size="md" />
        <div className="min-w-0 flex-1">
          <Text as="h1" variant="title" truncate>{document.name}</Text>
          <span className="flex flex-wrap items-center gap-2">
            <Text variant="helper" tone="muted">{facts}</Text>
            <StateBadge state={indexing.state}>{indexing.label}</StateBadge>
          </span>
        </div>
        {asking && beside ? (
          <Button variant="secondary" size="sm" onClick={() => ask(false)}>
            <Icon icon={MessageSquareOff} size="xs" />
            {READER.hideChat}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => ask(true)}>
            <Icon icon={Sparkles} size="xs" />
            {READER.ask}
          </Button>
        )}
        <IconButton icon={X} label={READER.close} size="sm" onClick={close} />
      </Surface>
      <div className="flex min-h-0 flex-1">
        <PageScroll underTitlebar={false} className={`min-w-0 flex-1 ${LAYOUT.listGutter} py-6`}>
          <DocumentBody document={document} page={reading?.page} />
        </PageScroll>
        {beside && (
          <Surface
            edge="left"
            className={cn('flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width] duration-move ease-move', asking ? READER.chatColumn : 'w-0')}
          >
            {asking && chat}
          </Surface>
        )}
      </div>
      {!beside && (
        <PushedPage open={asking} title={document.name} onBack={() => ask(false)} over="app">
          {chat}
        </PushedPage>
      )}
    </Surface>
  );
};
