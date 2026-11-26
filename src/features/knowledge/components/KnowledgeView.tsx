/** Knowledge: everything Roci reads — the documents you add, then your meetings and chats — in one list, narrowed by the
 *  scope bar (All · Documents · Meetings · Chats) and ⋯ Show (file type, indexing state, order), searched by name. Selecting
 *  anything previews it in the pane (a Mac: beside the list; iPhone: pushed), each with the same item actions; leaving for a
 *  meeting or chat leaves the way back. Add Files is the place's one primary action (and a Mac takes files dropped anywhere
 *  on the screen). On iPhone a document opens to read over Knowledge; on a Mac in its own window. */

import React, { useMemo, useState } from 'react';
import { Ellipsis, Library } from 'lucide-react';
import { ChoiceControl, EmptyAction, IconButton, ListDetail, PageScroll, PrimaryAction, PushedPage, SearchField, Text, useFilePicker, useListBesideDetail, ViewHeader } from '@shared/ui';
import { Menu, ScreenState, type MenuEntry } from '@shared/components';
import { confirmDelete } from '@shared/stores/confirmStore';
import { useKnowledgeStore, type KnowledgeFilter, type KnowledgeKind } from '@shared/stores/knowledgeStore';
import type { KnowledgeDocument } from '@services/storage';
import { platform } from '@platform/index';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import { useKnowledge } from '@features/knowledge/hooks/useKnowledge';
import { useKnowledgeSources } from '@features/knowledge/hooks/useKnowledgeSources';
import { conversationsShown, documentsShown } from '@features/knowledge/hooks/knowledgeFilter';
import { KnowledgeList } from './KnowledgeList';
import { DocumentDetail } from './DocumentDetail';
import { ConversationPreview } from './ConversationPreview';
import { DocumentReader } from './DocumentReader';

const { show: SHOW } = KNOWLEDGE_LIBRARY;

/** ⋯ Show: one checked group each for file type, state and order. */
function showEntries(filter: KnowledgeFilter, setFilter: (change: Partial<KnowledgeFilter>) => void): MenuEntry[] {
  const group = <K extends 'fileType' | 'state' | 'sort'>(key: K, spec: { title: string; options: Record<KnowledgeFilter[K], string> }): MenuEntry[] => [
    { type: 'label', label: spec.title },
    ...(Object.entries(spec.options) as [KnowledgeFilter[K], string][]).map(([value, label]): MenuEntry => (
      { type: 'check', label, checked: filter[key] === value, onSelect: () => setFilter({ [key]: value } as Partial<KnowledgeFilter>) }
    )),
  ];
  return [...group('fileType', SHOW.fileType), { type: 'separator' }, ...group('state', SHOW.state), { type: 'separator' }, ...group('sort', SHOW.sort)];
}

/** Files dragged in from Finder; anything else dragged over the screen is left to the page. */
const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');

export const KnowledgeView: React.FC = () => {
  const [query, setQuery] = useState('');
  const { documents: all, hasAny: hasDocuments, isLoading, error, statusOf, addFiles, remove } = useKnowledge(query);
  const conversations = useKnowledgeSources(query);
  const beside = useListBesideDetail();
  const filter = useKnowledgeStore((s) => s.filter);
  const setFilter = useKnowledgeStore((s) => s.setFilter);
  const selection = useKnowledgeStore((s) => s.selected);
  const select = useKnowledgeStore((s) => s.select);
  const reading = useKnowledgeStore((s) => s.reading);
  const read = useKnowledgeStore((s) => s.read);
  const picker = useFilePicker(addFiles);

  const documents = useMemo(() => documentsShown(all, filter, statusOf), [all, filter, statusOf]);
  const meetings = useMemo(() => conversationsShown(conversations.meetings, 'meeting', filter), [conversations.meetings, filter]);
  const chats = useMemo(() => conversationsShown(conversations.chats, 'chat', filter), [conversations.chats, filter]);
  const hasAny = hasDocuments || conversations.hasAny;
  const shownCount = documents.length + meetings.length + chats.length;

  // What the pane shows: the selection if it is still listed; beside the list (a Mac) else the first item listed.
  const documentOf = (key: string) => documents.find((d) => d.appPath && (d.id === key || d.appPath === key));
  const conversationOf = (kind: KnowledgeKind, key: string) => (kind === 'meeting' ? meetings : chats).find((c) => c.id === key);
  const first = documents.find((d) => d.appPath) ?? meetings[0] ?? chats[0];
  const fallback = beside && first ? ('name' in first ? { kind: 'file' as const, key: first.id } : { kind: first.kind, key: first.id }) : null;
  const shown = selection && (selection.kind === 'file' ? documentOf(selection.key) : conversationOf(selection.kind, selection.key)) ? selection : fallback;
  const readingDocument = !platform.hasWindowChrome && reading ? all.find((d) => d.appPath === reading.key || d.id === reading.key) : undefined;

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!(await confirmDelete(KNOWLEDGE_LIBRARY.noun))) return;
    if (shown?.key === document.id) select(null);
    remove(document.id);
  };

  const onDrop = (event: React.DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const addFilesAction = { label: KNOWLEDGE_LIBRARY.add, onPress: () => picker.open(KNOWLEDGE_LIBRARY.accept) };

  const detail = (() => {
    if (!shown) return null;
    if (shown.kind === 'file') {
      const document = documentOf(shown.key);
      return document && <DocumentDetail document={document} status={statusOf(document.id)} onDelete={() => void deleteDocument(document)} />;
    }
    const source = conversationOf(shown.kind, shown.key);
    return source && <ConversationPreview source={source} />;
  })();

  const list = (
    <>
      <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={KNOWLEDGE_LIBRARY.searchPlaceholder} />
      <ChoiceControl items={KNOWLEDGE_LIBRARY.scopes} value={filter.scope} onValueChange={(scope) => setFilter({ scope })} label={KNOWLEDGE_LIBRARY.scopeLabel} />
      <PageScroll underTitlebar={false} className="min-h-0 flex-1 pb-2">
        {shownCount > 0
          ? <KnowledgeList documents={documents} meetings={meetings} chats={chats} statusOf={statusOf} selected={shown} onSelect={select} />
          : <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{KNOWLEDGE_LIBRARY.noMatch}</Text>}
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
      accessory={<Menu label={SHOW.label} trigger={<IconButton icon={Ellipsis} label={SHOW.label} size="sm" />} items={showEntries(filter, setFilter)} />}
      primaryAction={<PrimaryAction action={addFilesAction} />}
      list={list}
      listClassName={KNOWLEDGE_LIBRARY.listColumn}
      detail={detail}
      onCloseDetail={() => select(null)}
    />
  );

  return (
    <div className="h-full" onDragOver={(event) => carriesFiles(event) && event.preventDefault()} onDrop={onDrop}>
      {screen}
      {picker.element}
      {readingDocument && (
        <PushedPage open title={readingDocument.name} onBack={() => read(null)} over="app" fill>
          <DocumentReader
            document={readingDocument}
            status={statusOf(readingDocument.id)}
            page={reading?.page}
            asking={reading?.asking ?? false}
            onAsking={(asking) => read({ key: readingDocument.appPath, page: reading?.page, asking })}
          />
        </PushedPage>
      )}
    </div>
  );
};
