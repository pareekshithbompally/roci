/** A document to read, big: its pages (pdf.js) or words, at the page an answer cited, with ✦ Ask opening the chat about it.
 *  On a Mac it is its own window: a toolbar in the titlebar, the pages, and the chat as a column beside them (the pages
 *  make room); on iPhone a page of its own, its actions in the bottom toolbar and the chat the next screen. The chat is a
 *  fresh one with the document attached as Search. */

import React from 'react';
import { FileTypeIcon, PageScroll, PushedPage, StateBadge, Surface, Text, cn } from '@shared/ui';
import { ItemActions } from '@shared/components';
import { platform } from '@platform/index';
import { ChatShell, useChatStore } from '@features/chat';
import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { LAYOUT } from '@config/layout.config';
import { READER } from '@config/knowledgeLibrary.config';
import { DocumentBody } from './DocumentBody';
import { documentFacts, indexingOf } from './documentFacts';

export interface DocumentReaderProps {
  document: KnowledgeDocument;
  status: SourceStatus | undefined;
  page?: number;
  asking: boolean;
  onAsking: (asking: boolean) => void;
}

/** Opens or closes the chat; opening starts a fresh chat about the document. */
function useAsk(document: KnowledgeDocument, asking: boolean, onAsking: (asking: boolean) => void) {
  return () => {
    if (!asking) useChatStore.getState().startDocumentChat({ name: document.name, mediaType: document.mediaType, appPath: document.appPath });
    onAsking(!asking);
  };
}

const Header: React.FC<{ document: KnowledgeDocument; status: SourceStatus | undefined; children?: React.ReactNode }> = ({ document, status, children }) => {
  const indexing = indexingOf(status);
  return (
    <Surface as="header" edge="bottom" className={cn('flex shrink-0 items-center gap-3 pr-4', LAYOUT.paneToolbar.titlebar, LAYOUT.paneToolbar.clearFloating)}>
      <FileTypeIcon name={document.name} size="md" />
      <div className="min-w-0 flex-1">
        <Text as="h1" variant="title" truncate>{document.name}</Text>
        <span className="flex items-center gap-2">
          <Text variant="helper" tone="muted" truncate>{documentFacts(document)}</Text>
          <StateBadge state={indexing.state}>{indexing.label}</StateBadge>
        </span>
      </div>
      {children}
    </Surface>
  );
};

const Pages: React.FC<{ document: KnowledgeDocument; page?: number }> = ({ document, page }) => (
  <PageScroll underTitlebar={false} className={`min-h-0 min-w-0 flex-1 ${LAYOUT.listGutter} py-6`}>
    <DocumentBody document={document} page={page} />
  </PageScroll>
);

const chat = <ChatShell placeholder={READER.chatPlaceholder} />;

/** A Mac: the whole window. The chat sits in a column of fixed width that the panel reveals, so it lays out at its own size
 *  (never measured squeezed while the panel opens). */
const ReaderWindowLayout: React.FC<DocumentReaderProps> = ({ document, status, page, asking, onAsking }) => {
  const ask = useAsk(document, asking, onAsking);
  return (
    <Surface variant="page" className="flex h-dvh flex-col">
      <Header document={document} status={status}>
        <ItemActions placement="header" onAsk={ask} />
      </Header>
      <div className="flex min-h-0 flex-1">
        <Pages document={document} page={page} />
        <Surface edge="left" className={cn('shrink-0 overflow-hidden transition-[width] duration-move ease-move', asking ? READER.chatColumn : 'w-0')}>
          <div className={cn('flex h-full flex-col', READER.chatColumn)}>{asking && chat}</div>
        </Surface>
      </div>
    </Surface>
  );
};

/** iPhone: the reader's page body; its chat the next screen. */
const ReaderPageLayout: React.FC<DocumentReaderProps> = ({ document, page, asking, onAsking }) => {
  const ask = useAsk(document, asking, onAsking);
  return (
    <div className="flex h-full flex-col">
      <Pages document={document} page={page} />
      <ItemActions placement="bottom" onAsk={ask} />
      <PushedPage open={asking} title={READER.chatAbout(document.name)} onBack={() => onAsking(false)} over="app" fill>
        {chat}
      </PushedPage>
    </div>
  );
};

export const DocumentReader: React.FC<DocumentReaderProps> = (props) =>
  platform.hasWindowChrome ? <ReaderWindowLayout {...props} /> : <ReaderPageLayout {...props} />;
