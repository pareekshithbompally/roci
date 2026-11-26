/** The document pages an answer drew on, as small pills under it ("Q3 pricing.pdf · p. 3"). One in the Knowledge library now
 *  (kept then or since) opens there; one that isn't (a chat's own attachment, or deleted since) is named only. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Button, Icon } from '@shared/ui';
import { libraryQuery } from '@shared/query/library';
import { openDocument } from '@shared/stores/knowledgeStore';
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
          onClick={() => openDocument(citation.path)}
        >
          <Icon icon={FileText} size="xs" />
          {CITATION_COPY.document(citation.name, citation.page)}
        </Button>
      ))}
    </div>
  );
};
