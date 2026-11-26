/** How Knowledge's list is narrowed (the scope bar and ⋯ Show): which kinds, which file types (documents only), which
 *  indexing state, in what order. Pure, so the list and the pane's default agree. */

import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import type { KnowledgeFilter, KnowledgeKind } from '@shared/stores/knowledgeStore';
import { fileExtension } from '@shared/utils/file.utils';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { ConversationSource } from './useKnowledgeSources';

const shows = (filter: KnowledgeFilter, kind: KnowledgeKind) => filter.scope === 'all' || filter.scope === kind;

/** A source's indexing state matches the filter: none yet counts as indexing. */
const stateMatches = (filter: KnowledgeFilter, status: SourceStatus | undefined) =>
  filter.state === 'any' || (status?.state ?? 'pending') === filter.state;

const isMarkdown = (document: KnowledgeDocument) => fileExtension(document.name) === KNOWLEDGE_LIBRARY.markdown.extension;

function typeMatches(filter: KnowledgeFilter, document: KnowledgeDocument): boolean {
  switch (filter.fileType) {
    case 'all': return true;
    case 'pdf': return document.format === 'pdf';
    case 'markdown': return isMarkdown(document);
    case 'text': return document.format === 'text' && !isMarkdown(document);
  }
}

function sorted<T>(items: T[], filter: KnowledgeFilter, nameOf: (item: T) => string): T[] {
  return filter.sort === 'name' ? [...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b))) : items;
}

export function documentsShown(documents: KnowledgeDocument[], filter: KnowledgeFilter, statusOf: (id: string) => SourceStatus | undefined): KnowledgeDocument[] {
  if (!shows(filter, 'file')) return [];
  return sorted(documents.filter((d) => typeMatches(filter, d) && stateMatches(filter, statusOf(d.id))), filter, (d) => d.name);
}

/** Meetings or chats: a file type narrows to documents, so they show only for All files. */
export function conversationsShown(sources: ConversationSource[], kind: 'meeting' | 'chat', filter: KnowledgeFilter): ConversationSource[] {
  if (!shows(filter, kind) || filter.fileType !== 'all') return [];
  return sorted(sources.filter((s) => stateMatches(filter, s.status)), filter, (s) => s.title);
}
