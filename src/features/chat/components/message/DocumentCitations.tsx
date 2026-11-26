/** The document pages an answer drew on, as small pills under it ("Q3 pricing.pdf · p. 3"): one in the Knowledge library
 *  opens there; a chat's own attachment is named only (it is in the chat already). */

import React from 'react';
import { FileText } from 'lucide-react';
import { Button, Icon } from '@shared/ui';
import { openDocument } from '@features/knowledge/stores/knowledgeStore';
import { CITATION_COPY } from '@config/chat.config';
import type { DocumentCitation } from '@extensions/tools/types';

export const DocumentCitations: React.FC<{ citations: DocumentCitation[] }> = ({ citations }) => (
  <div className="flex flex-wrap items-center gap-2">
    {citations.map((citation) => (
      <Button
        key={`${citation.path}#${citation.page ?? ''}`}
        variant="outline"
        size="sm"
        disabled={!citation.kept}
        onClick={() => openDocument(citation.path)}
      >
        <Icon icon={FileText} size="xs" />
        {CITATION_COPY.document(citation.name, citation.page)}
      </Button>
    ))}
  </div>
);
