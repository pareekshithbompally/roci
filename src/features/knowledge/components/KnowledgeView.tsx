/** Knowledge: the documents you add, newest first, searchable by name; Dictations' shape. Mac: the list beside the open
 *  document, and files dropped anywhere on the screen are added; iPhone: the list, then one document pushed. + adds files
 *  (PDF, text, Markdown). Each says how far indexing it has got. A document opens to its name, kind · size · day, its pages
 *  (a PDF as WebKit draws it) or its words, then what is related to it; Delete. */

import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Library, Plus, Trash2 } from 'lucide-react';
import { Icon, IconButton, Input, ListDetail, PageScroll, PdfFrame, Row, SearchField, Surface, Text, useListBesideDetail, ViewHeader } from '@shared/ui';
import { Markdown, ScreenState } from '@shared/components';
import { useKeptFileUrl, useObjectUrl } from '@shared/hooks';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import { queryKeys } from '@shared/query/queryKeys';
import { formatDayLabel, formatFileSize } from '@shared/utils/formatters';
import { fileExtension } from '@shared/utils/file.utils';
import { assetsService, type KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { platform } from '@platform/index';
import { LAYOUT } from '@config/layout.config';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import { useKnowledge } from '@features/knowledge/hooks/useKnowledge';
import { useKnowledgeStore } from '@features/knowledge/stores/knowledgeStore';
import { RelatedSources } from '@features/knowledge/components/RelatedSources';

/** "PDF · 1.2 MB · Today · Ready": a document still saving or not yet indexed says Indexing…. */
function factsOf(document: KnowledgeDocument, status: SourceStatus | undefined): string {
  return [
    fileExtension(document.name).toUpperCase(),
    document.bytes !== undefined && formatFileSize(document.bytes),
    formatDayLabel(document.createdAt),
    KNOWLEDGE_LIBRARY.states[status?.state ?? 'pending'],
  ].filter(Boolean).join(' · ');
}

const isMarkdown = (document: KnowledgeDocument) =>
  document.mediaType === KNOWLEDGE_LIBRARY.markdown.mediaType || fileExtension(document.name) === KNOWLEDGE_LIBRARY.markdown.extension;

interface DocumentListProps {
  documents: KnowledgeDocument[];
  statusOf: (id: string) => SourceStatus | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The documents under one heading, each its name with kind · size · day · state under it; one still being saved can't be
 *  opened yet. */
const DocumentList: React.FC<DocumentListProps> = ({ documents, statusOf, selectedId, onSelect }) => (
  <section>
    <Text as="h2" variant="label" tone="muted" className="px-2.5 pb-1">{KNOWLEDGE_LIBRARY.documents}</Text>
    {documents.map((document) => (
      <Row
        key={document.id}
        selected={document.id === selectedId}
        disabled={!document.appPath}
        leading={<Icon icon={FileText} size="xs" tone="muted" />}
        onClick={() => onSelect(document.id)}
      >
        <Text as="span" truncate className="block">{document.name}</Text>
        <Text as="span" variant="helper" tone="muted" truncate className="block">{factsOf(document, statusOf(document.id))}</Text>
      </Row>
    ))}
  </section>
);

/** A PDF's pages as WebKit draws them, read into a `blob:` URL while it is open. */
const DocumentPdf: React.FC<{ document: KnowledgeDocument }> = ({ document }) => {
  const { showToast } = useToast();
  const src = useKeptFileUrl(document.appPath);
  const objectUrl = useObjectUrl(src ?? null, (error) => {
    console.error('[Knowledge] Reading the PDF failed:', document.name, error);
    showToast(KNOWLEDGE_LIBRARY.readFailed(document.name), 'error');
  });
  if (!objectUrl) return null;
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${LAYOUT.listGutter} py-4`}>
      <PdfFrame src={objectUrl} title={document.name} />
    </div>
  );
};

/** A text file's words: Markdown as Markdown, any other as written. */
const DocumentText: React.FC<{ document: KnowledgeDocument }> = ({ document }) => {
  const { data: text, isError } = useQuery({
    queryKey: queryKeys.appFileText(document.appPath),
    queryFn: () => assetsService.text(document.appPath),
    staleTime: Infinity,
  });
  const gutter = `${LAYOUT.listGutter} py-4`;
  if (isError) return <Text as="p" variant="helper" tone="muted" className={gutter}>{KNOWLEDGE_LIBRARY.readFailed(document.name)}</Text>;
  if (text === undefined) return null;
  if (isMarkdown(document)) return <div className={`select-text ${gutter}`}><Markdown content={text} /></div>;
  return <Text as="p" variant="reading" className={`select-text whitespace-pre-wrap ${gutter}`}>{text}</Text>;
};

interface DocumentDetailProps {
  document: KnowledgeDocument;
  status: SourceStatus | undefined;
  onDelete: () => void;
  onOpenDocument: (id: string) => void;
}

/** The document's name as the title, kind · size · day · state under it (why, when it couldn't be read), then its pages or
 *  words, then what is related. */
const DocumentDetail: React.FC<DocumentDetailProps> = ({ document, status, onDelete, onOpenDocument }) => (
  <article className="flex h-full flex-col">
    <Surface as="header" edge="bottom" className={`flex items-start gap-2 ${LAYOUT.listGutter} py-4`}>
      <div className="min-w-0 flex-1">
        <Text as="h2" variant="title" truncate>{document.name}</Text>
        <Text variant="helper" tone="muted">{factsOf(document, status)}</Text>
        {status?.error && <Text variant="helper" tone="muted">{status.error}</Text>}
      </div>
      <IconButton icon={Trash2} label={KNOWLEDGE_LIBRARY.delete} size="sm" variant="dangerGhost" onClick={onDelete} />
    </Surface>
    {document.format === 'pdf' ? <DocumentPdf document={document} /> : <DocumentText document={document} />}
    <RelatedSources id={document.id} ready={status?.state === 'ready'} onOpenDocument={onOpenDocument} />
  </article>
);

/** Files dragged in from Finder; anything else dragged over the screen is left to the page. */
const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');

export const KnowledgeView: React.FC = () => {
  const [query, setQuery] = useState('');
  const { documents, hasAny, isLoading, statusOf, addFiles, remove } = useKnowledge(query);
  const beside = useListBesideDetail();
  const selectedId = useKnowledgeStore((s) => s.selected);
  const setSelectedId = useKnowledgeStore((s) => s.select);
  const picker = useRef<HTMLInputElement>(null);

  // Beside the list (a Mac) one document is always open (the newest saved match until another is picked); pushed (iPhone),
  // only the one tapped.
  const opened = documents.filter((d) => d.appPath);
  const selected = opened.find((d) => d.id === selectedId || d.appPath === selectedId) ?? (beside ? opened[0] : undefined);

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!(await confirmDelete(KNOWLEDGE_LIBRARY.noun))) return;
    if (document.id === selected?.id) setSelectedId(null);
    remove(document.id);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    // Reset so the same file can be picked again.
    event.target.value = '';
  };

  const onDrop = (event: React.DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const addButton = (
    <>
      <IconButton icon={Plus} label={KNOWLEDGE_LIBRARY.add} size="toolbar" onClick={() => picker.current?.click()} />
      <Input ref={picker} type="file" multiple accept={KNOWLEDGE_LIBRARY.accept} onChange={onPick} className="hidden" />
    </>
  );

  const searchAndList = (
    <>
      <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={KNOWLEDGE_LIBRARY.searchPlaceholder} />
      <PageScroll underTitlebar={false} className="min-h-0 flex-1 pb-2">
        {documents.length > 0
          ? <DocumentList documents={documents} statusOf={statusOf} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          : <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{KNOWLEDGE_LIBRARY.noMatch}</Text>}
      </PageScroll>
    </>
  );

  const screen = isLoading || !hasAny ? (
    <div className="flex h-full flex-col">
      <ViewHeader title={KNOWLEDGE_LIBRARY.title} accessory={addButton} />
      <ScreenState
        loading={isLoading}
        empty={{ icon: Library, message: platform.hasFileManager ? KNOWLEDGE_LIBRARY.emptyDrop : KNOWLEDGE_LIBRARY.empty }}
      />
    </div>
  ) : (
    <ListDetail
      title={KNOWLEDGE_LIBRARY.title}
      accessory={addButton}
      list={searchAndList}
      listClassName={KNOWLEDGE_LIBRARY.listColumn}
      detail={selected && (
        <DocumentDetail
          document={selected}
          status={statusOf(selected.id)}
          onDelete={() => void deleteDocument(selected)}
          onOpenDocument={setSelectedId}
        />
      )}
      onCloseDetail={() => setSelectedId(null)}
    />
  );

  return (
    <div className="h-full" onDragOver={(event) => carriesFiles(event) && event.preventDefault()} onDrop={onDrop}>
      {screen}
    </div>
  );
};
