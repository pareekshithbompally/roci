/** A document's facts line ("PDF · 1.2 MB · Today") and its indexing state, as the list, the pane and the reader show them. */

import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import { formatDayLabel, formatFileSize } from '@shared/utils/formatters';
import { fileExtension } from '@shared/utils/file.utils';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';

export function documentFacts(document: KnowledgeDocument): string {
  return [
    fileExtension(document.name).toUpperCase(),
    document.bytes !== undefined && formatFileSize(document.bytes),
    formatDayLabel(document.createdAt),
  ].filter(Boolean).join(' · ');
}

/** How far indexing a source has got (words and the state that draws them); none yet counts as indexing. */
export const indexingOf = (status: SourceStatus | undefined) => KNOWLEDGE_LIBRARY.states[status?.state ?? 'pending'];
