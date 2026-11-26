/** A document's content, wherever it shows (the Knowledge pane, the full-window reader): a PDF's pages drawn by pdf.js
 *  (at `page` when an answer cited one), a text file's words (Markdown as Markdown). A file that can't be read says so. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@shared/ui';
import { Markdown, PdfPages } from '@shared/components';
import { useKeptFileUrl } from '@shared/hooks';
import { useToast } from '@shared/contexts/ToastContext';
import { queryKeys } from '@shared/query/queryKeys';
import { fileExtension } from '@shared/utils/file.utils';
import { assetsService, type KnowledgeDocument } from '@services/storage';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';

const isMarkdown = (document: KnowledgeDocument) =>
  document.mediaType === KNOWLEDGE_LIBRARY.markdown.mediaType || fileExtension(document.name) === KNOWLEDGE_LIBRARY.markdown.extension;

const Unreadable: React.FC<{ name: string }> = ({ name }) => <Text as="p" variant="helper" tone="muted">{KNOWLEDGE_LIBRARY.readFailed(name)}</Text>;

const DocumentPages: React.FC<{ document: KnowledgeDocument; page?: number }> = ({ document, page }) => {
  const { showToast } = useToast();
  const src = useKeptFileUrl(document.appPath);
  // Its file is gone (removed outside Roci): say so rather than show nothing.
  if (src === null) return <Unreadable name={document.name} />;
  return (
    <PdfPages
      src={src ?? null}
      page={page}
      onError={(error) => {
        console.error('[Knowledge] Reading the PDF failed:', document.name, error);
        showToast(KNOWLEDGE_LIBRARY.readFailed(document.name), 'error');
      }}
    />
  );
};

const DocumentText: React.FC<{ document: KnowledgeDocument }> = ({ document }) => {
  const { data: text, isError } = useQuery({
    queryKey: queryKeys.appFileText(document.appPath),
    queryFn: () => assetsService.text(document.appPath),
    staleTime: Infinity,
  });
  if (isError) return <Unreadable name={document.name} />;
  if (text === undefined) return null;
  if (isMarkdown(document)) return <div className="select-text"><Markdown content={text} /></div>;
  return <Text as="p" variant="reading" className="select-text whitespace-pre-wrap">{text}</Text>;
};

export const DocumentBody: React.FC<{ document: KnowledgeDocument; page?: number }> = ({ document, page }) =>
  document.format === 'pdf' ? <DocumentPages document={document} page={page} /> : <DocumentText document={document} />;
