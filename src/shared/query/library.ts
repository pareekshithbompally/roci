/** The Knowledge library's documents as one query, so Knowledge, Keep in Knowledge and citations read and change one cache. */

import { documentsService } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';

export const libraryQuery = {
  queryKey: queryKeys.knowledgeLibrary(),
  queryFn: () => documentsService.list(KNOWLEDGE_LIBRARY.listLimit),
  enabled: isTauriEnvironment(),
};
