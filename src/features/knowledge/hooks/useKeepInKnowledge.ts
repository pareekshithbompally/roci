/** Keep in Knowledge for a file attached in a chat: whether it is in the library already, and keeping it (optimistic: it
 *  shows in the library at once, rolled back on failure). Kept, it outlives its chat and is indexed for the library. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { store } from '@services/db';
import { documentFormat, type KnowledgeDocument } from '@services/storage';
import { useToast } from '@shared/contexts/ToastContext';
import type { FileUIPart } from '@shared/types';
import { ATTACHMENT_COPY } from '@config/chat.config';
import { libraryQuery } from './libraryQuery';

/** The attachment as a library row until the library is read again. */
function keeping(part: FileUIPart): KnowledgeDocument {
  const name = part.filename ?? part.url;
  return { id: part.url, appPath: part.url, name, mediaType: part.mediaType, format: documentFormat(part.mediaType, name) ?? 'text', createdAt: Date.now() };
}

export function useKeepInKnowledge(part: FileUIPart) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const key = libraryQuery.queryKey;
  const { data: library = [] } = useQuery(libraryQuery);
  const kept = library.some((document) => document.appPath === part.url);

  const keep = useMutation({
    mutationFn: () => store.assets.keep(part.url),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<KnowledgeDocument[]>(key);
      queryClient.setQueryData<KnowledgeDocument[]>(key, (old) => [keeping(part), ...(old ?? [])]);
      return { previous };
    },
    onError: (error: unknown, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[Knowledge] Keep failed:', part.url, error);
      showToast(ATTACHMENT_COPY.keepFailed(part.filename ?? part.url), 'error');
    },
    onSuccess: () => showToast(ATTACHMENT_COPY.kept, 'success'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { kept, keep: () => keep.mutate() };
}
