/** Knowledge: the documents you add, newest first, searchable by name; Dictations' shape. Mac: the list beside the open
 *  document, and files dropped anywhere on the screen are added; iPhone: the list, then one document pushed. + adds files
 *  (PDF, text, Markdown). Each says how far indexing it has got. A document opens to its name, kind · size · day, its pages
 *  (a PDF as WebKit draws it) or its words, then what is related to it; Delete. */

import React, { useState } from 'react';
import { Library, Maximize2, Sparkles, Trash2 } from 'lucide-react';
import { Button, EmptyAction, FileTypeIcon, Icon, IconButton, ListDetail, PageScroll, Row, SearchField, StateBadge, StateMark, Surface, Text, useFilePicker, useListBesideDetail, ViewHeader } from '@shared/ui';
import { ScreenState } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { formatDayLabel, formatFileSize } from '@shared/utils/formatters';
import { fileExtension } from '@shared/utils/file.utils';
import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { platform } from '@platform/index';
import { LAYOUT } from '@config/layout.config';
import { KNOWLEDGE_LIBRARY, READER } from '@config/knowledgeLibrary.config';
import { useKnowledge } from '@features/knowledge/hooks/useKnowledge';
import { DocumentBody } from '@features/knowledge/components/DocumentBody';
import { DocumentReader } from '@features/knowledge/components/DocumentReader';
import { useChatStore } from '@features/chat';
import { useKnowledgeSources } from '@features/knowledge/hooks/useKnowledgeSources';
import { ConversationSections } from '@features/knowledge/components/ConversationSections';
import { useKnowledgeStore } from '@shared/stores/knowledgeStore';
import { RelatedSources } from '@features/knowledge/components/RelatedSources';

/** "PDF · 1.2 MB · Today". */
function factsOf(document: KnowledgeDocument): string {
  return [
    fileExtension(document.name).toUpperCase(),
    document.bytes !== undefined && formatFileSize(document.bytes),
    formatDayLabel(document.createdAt),
  ].filter(Boolean).join(' · ');
}

/** How far indexing a document has got: a document still saving or not yet indexed is indexing. */
const indexingOf = (status: SourceStatus | undefined) => KNOWLEDGE_LIBRARY.states[status?.state ?? 'pending'];

interface DocumentListProps {
  documents: KnowledgeDocument[];
  statusOf: (id: string) => SourceStatus | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The documents under one heading, each its name with kind · size · day under it and its indexing state's mark beside it;
 *  one still being saved can't be opened yet. */
const DocumentList: React.FC<DocumentListProps> = ({ documents, statusOf, selectedId, onSelect }) => (
  <section>
    <Text as="h2" variant="label" tone="muted" className="px-2.5 pb-1">{KNOWLEDGE_LIBRARY.documents}</Text>
    {documents.map((document) => (
      <Row
        key={document.id}
        selected={document.id === selectedId}
        disabled={!document.appPath}
        leading={<FileTypeIcon name={document.name} />}
        onClick={() => onSelect(document.id)}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <Text as="span" truncate className="block">{document.name}</Text>
            <Text as="span" variant="helper" tone="muted" truncate className="block">{factsOf(document)}</Text>
          </span>
          <StateMark state={indexingOf(statusOf(document.id)).state} label={indexingOf(statusOf(document.id)).label} />
        </span>
      </Row>
    ))}
  </section>
);

interface DocumentDetailProps {
  document: KnowledgeDocument;
  status: SourceStatus | undefined;
  onDelete: () => void;
  onOpenDocument: (id: string) => void;
  /** Opens it full window, its chat beside it when `asking`. */
  onRead: (asking: boolean) => void;
}

/** The document's name as the title, kind · size · day · state under it (why, when it couldn't be read), then its pages or
 *  words, then what is related. */
const DocumentDetail: React.FC<DocumentDetailProps> = ({ document, status, onDelete, onOpenDocument, onRead }) => (
  <article className="flex h-full flex-col">
    <Surface as="header" edge="bottom" className={`flex items-start gap-2 ${LAYOUT.listGutter} py-4`}>
      <FileTypeIcon name={document.name} size="md" />
      <div className="min-w-0 flex-1">
        <Text as="h2" variant="title" truncate>{document.name}</Text>
        <span className="flex flex-wrap items-center gap-2">
          <Text variant="helper" tone="muted">{factsOf(document)}</Text>
          <StateBadge state={indexingOf(status).state}>{indexingOf(status).label}</StateBadge>
        </span>
        {status?.error && <Text variant="helper" tone="muted">{status.error}</Text>}
      </div>
      <IconButton icon={Trash2} label={KNOWLEDGE_LIBRARY.delete} size="sm" variant="dangerGhost" onClick={onDelete} />
      <Button variant="secondary" size="sm" onClick={() => onRead(false)}>
        <Icon icon={Maximize2} size="xs" />
        {READER.open}
      </Button>
      <Button variant="primary" size="sm" onClick={() => onRead(true)}>
        <Icon icon={Sparkles} size="xs" />
        {READER.ask}
      </Button>
    </Surface>
    <div className={`min-h-0 flex-1 overflow-y-auto ${LAYOUT.listGutter} py-4`}>
      <DocumentBody document={document} />
    </div>
    <RelatedSources id={document.id} ready={status?.state === 'ready'} onOpenDocument={onOpenDocument} />
  </article>
);

/** Files dragged in from Finder; anything else dragged over the screen is left to the page. */
const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');

export const KnowledgeView: React.FC = () => {
  const [query, setQuery] = useState('');
  const { documents, hasAny: hasDocuments, isLoading, error, statusOf, addFiles, remove } = useKnowledge(query);
  const conversations = useKnowledgeSources(query);
  const hasAny = hasDocuments || conversations.hasAny;
  const beside = useListBesideDetail();
  const selectedId = useKnowledgeStore((s) => s.selected);
  const reading = useKnowledgeStore((s) => s.reading);
  const read = useKnowledgeStore((s) => s.read);
  const setSelectedId = useKnowledgeStore((s) => s.select);
  const picker = useFilePicker(addFiles);

  // Beside the list (a Mac) one document is always open (the newest saved match until another is picked); pushed (iPhone),
  // only the one tapped.
  const opened = documents.filter((d) => d.appPath);
  const selected = opened.find((d) => d.id === selectedId || d.appPath === selectedId) ?? (beside ? opened[0] : undefined);
  const readingDocument = reading && opened.find((d) => d.id === reading.key || d.appPath === reading.key);

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!(await confirmDelete(KNOWLEDGE_LIBRARY.noun))) return;
    if (document.id === selected?.id) setSelectedId(null);
    remove(document.id);
  };

  const onDrop = (event: React.DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const addFilesAction = { label: KNOWLEDGE_LIBRARY.add, onPress: () => picker.open(KNOWLEDGE_LIBRARY.accept) };

  const searchAndList = (
    <>
      <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={KNOWLEDGE_LIBRARY.searchPlaceholder} />
      <PageScroll underTitlebar={false} className="min-h-0 flex-1 pb-2">
        {documents.length > 0 && <DocumentList documents={documents} statusOf={statusOf} selectedId={selected?.id ?? null} onSelect={setSelectedId} />}
        <ConversationSections meetings={conversations.meetings} chats={conversations.chats} />
        {documents.length + conversations.meetings.length + conversations.chats.length === 0 && (
          <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{KNOWLEDGE_LIBRARY.noMatch}</Text>
        )}
      </PageScroll>
    </>
  );

  const screen = isLoading || error || !hasAny ? (
    <div className="flex h-full flex-col">
      <ViewHeader title={KNOWLEDGE_LIBRARY.title} />
      <ScreenState
        loading={isLoading}
        error={error && { cause: error, title: KNOWLEDGE_LIBRARY.loadFailed }}
        empty={{
          icon: Library,
          message: KNOWLEDGE_LIBRARY.emptyTitle,
          description: platform.hasFileManager ? KNOWLEDGE_LIBRARY.emptyDrop : KNOWLEDGE_LIBRARY.empty,
          action: <EmptyAction action={addFilesAction} />,
        }}
      />
    </div>
  ) : (
    <ListDetail
      title={KNOWLEDGE_LIBRARY.title}
      primaryAction={addFilesAction}
      list={searchAndList}
      listClassName={KNOWLEDGE_LIBRARY.listColumn}
      detail={selected && (
        <DocumentDetail
          document={selected}
          status={statusOf(selected.id)}
          onDelete={() => void deleteDocument(selected)}
          onOpenDocument={setSelectedId}
          onRead={(asking) => {
            if (asking) useChatStore.getState().startDocumentChat({ name: selected.name, mediaType: selected.mediaType, appPath: selected.appPath });
            read({ key: selected.id, asking });
          }}
        />
      )}
      onCloseDetail={() => setSelectedId(null)}
    />
  );

  return (
    <div className="h-full" onDragOver={(event) => carriesFiles(event) && event.preventDefault()} onDrop={onDrop}>
      {screen}
      {picker.element}
      {readingDocument && <DocumentReader document={readingDocument} status={statusOf(readingDocument.id)} facts={factsOf(readingDocument)} />}
    </div>
  );
};
