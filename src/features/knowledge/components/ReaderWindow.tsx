/** A Mac reader window's whole app: the document it was opened for (by its app path), at the page asked, its chat open when
 *  asked (fed Settings' models and providers, as the main window's chat is); Knowledge's later requests for the same
 *  document (another page pill, ✦) arrive as `reader://go`. */

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FileX } from 'lucide-react';
import { ScreenState } from '@shared/components';
import { libraryQuery } from '@shared/query/library';
import { queryKeys } from '@shared/query/queryKeys';
import { store } from '@services/db';
import { useChatRuntime } from '@features/chat';
import { dismissSplash } from '@/src/app/splash';
import { KNOWLEDGE_LIBRARY, READER } from '@config/knowledgeLibrary.config';
import type { ReaderRequest } from '@features/knowledge/reader';
import { DocumentReader } from './DocumentReader';

export const ReaderWindow: React.FC<{ request: ReaderRequest }> = ({ request }) => {
  useChatRuntime();
  const [shown, setShown] = useState(request);
  const { data: library, isPending } = useQuery(libraryQuery);
  const { data: statuses = [] } = useQuery({ queryKey: queryKeys.sourceStates('file'), queryFn: () => store.sources.states('file') });
  const document = library?.find((d) => d.appPath === request.path);

  useEffect(() => dismissSplash(), []);
  useEffect(() => {
    const listening = getCurrentWebviewWindow().listen<ReaderRequest>(READER.event, ({ payload }) => setShown(payload));
    return () => void listening.then((stop) => stop());
  }, []);

  if (!document) {
    return <ScreenState loading={isPending} empty={{ icon: FileX, message: KNOWLEDGE_LIBRARY.readFailed(request.path) }} />;
  }
  return (
    <DocumentReader
      document={document}
      status={statuses.find((s) => s.owner_id === document.id)}
      page={shown.page}
      asking={shown.asking}
      onAsking={(asking) => setShown((now) => ({ ...now, asking }))}
    />
  );
};
