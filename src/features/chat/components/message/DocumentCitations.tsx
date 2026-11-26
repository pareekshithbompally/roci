/** The document pages an answer drew on, as small pills under it ("Q3 pricing.pdf · p. 3"). One in the Knowledge library now
 *  (kept then or since) opens in the reader at that page; one that isn't (a chat's own attachment, or deleted) is named only. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FileTypeIcon } from '@shared/ui';
import { libraryQuery } from '@shared/query/library';
import { openReader } from '@features/knowledge/reader';
import { CITATION_COPY } from '@config/chat.config';
import type { DocumentCitation } from '@extensions/tools/types';

export const DocumentCitations: React.FC<{ citations: DocumentCitation[] }> = ({ citations }) => {
  const { data: library = [] } = useQuery(libraryQuery);
  const inLibrary = (path: string) => library.some((document) => document.appPath === path);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {citations.map((citation) => (
        <Button
          key={`${citation.path}#${citation.page ?? ''}`}
          variant="outline"
          size="sm"
          disabled={!inLibrary(citation.path)}
          onClick={() => openReader({ path: citation.path, page: citation.page ?? undefined, asking: false }, citation.name)}
        >
          <FileTypeIcon name={citation.name} />
          {CITATION_COPY.document(citation.name, citation.page)}
        </Button>
      ))}
    </div>
  );
};
