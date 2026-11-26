/** The Knowledge library: every document, newest first, narrowed to those whose name contains `query`, with how far indexing
 *  each has got (read again as Rust reports each change); Add (each file shows at once and stays if it saves) and Delete,
 *  both optimistic and rolled back on failure. */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsService, documentFormat, type KnowledgeDocument } from '@services/storage';
import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { useTauriEvent } from '@shared/hooks';
import type { SourceStatus } from '@shared/types/native';
import { attachmentMediaType } from '@shared/utils/chatParts';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import { libraryQuery } from '@shared/query/library';

/** A document still being saved: shown in the list, opened once it is in. */
function adding(file: File): KnowledgeDocument {
  const mediaType = attachmentMediaType(file.type, file.name);
  return {
    id: `adding-${crypto.randomUUID()}`,
    appPath: '',
    name: file.name,
    mediaType,
    format: documentFormat(mediaType, file.name) ?? 'text',
    bytes: file.size,
    createdAt: Date.now(),
  };
}

export function useKnowledge(query: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const key = queryKeys.knowledgeLibrary();
  const { data: all = [], isLoading, error } = useQuery(libraryQuery);
  const { data: statuses = [] } = useQuery({
    queryKey: queryKeys.sourceStates('file'),
    queryFn: () => store.sources.states('file'),
    enabled: isTauriEnvironment(),
  });
  const statusById = useMemo(() => new Map(statuses.map((status) => [status.owner_id, status])), [statuses]);
  // A document indexed, or one that couldn't be read: the states and what is related are read again (not the list).
  useTauriEvent<{ kind: string }>(KNOWLEDGE_LIBRARY.sourceEvent, ({ kind }) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sourceStates(kind) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.relatedSourcesAll() });
  });
  const documents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? all.filter((d) => d.name.toLocaleLowerCase().includes(needle)) : all;
  }, [all, query]);

  // Each file is saved on its own; one that fails says so and the rest stay.
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.allSettled(files.map((file) => documentsService.add(file)));
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') return;
        console.error('[Knowledge] Add failed:', files[i].name, result.reason);
        showToast(KNOWLEDGE_LIBRARY.addFailed(files[i].name), 'error');
      });
    },
    onMutate: async (files) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<KnowledgeDocument[]>(key);
      queryClient.setQueryData<KnowledgeDocument[]>(key, (old) => [...files.map(adding), ...(old ?? [])]);
      return { previous };
    },
    onError: (error: unknown, _files, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[Knowledge] Add failed:', error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => documentsService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<KnowledgeDocument[]>(key);
      queryClient.setQueryData<KnowledgeDocument[]>(key, (old) => old?.filter((d) => d.id !== id));
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[Knowledge] Delete failed:', error);
      showToast(KNOWLEDGE_LIBRARY.deleteFailed, 'error');
    },
    // Chats showing the document read its file's URL again, so they show it removed.
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: queryKeys.appFileUrls() }),
    ]),
  });

  /** Adds the files Knowledge reads; any other is named and left out. */
  const addFiles = (files: File[]) => {
    const readable = files.filter((file) => {
      if (documentFormat(attachmentMediaType(file.type, file.name), file.name)) return true;
      showToast(KNOWLEDGE_LIBRARY.unsupported(file.name), 'error');
      return false;
    });
    if (readable.length > 0) add.mutate(readable);
  };

  /** How far indexing the document has got; none yet means it is still being indexed. */
  const statusOf = (id: string): SourceStatus | undefined => statusById.get(id);

  return { documents, hasAny: all.length > 0, isLoading, error, statusOf, addFiles, remove: remove.mutate };
}
