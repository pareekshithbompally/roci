/** Inline superscript favicon + citation number; hover shows the URL, click opens it. */

import React from 'react';
import { getFaviconUrl, describeCitation } from '@shared/utils/citationUtils';
import type { WebCitation } from '@shared/types';
import { Button } from '@shared/ui';

interface InlineCitationMarkerProps {
  /** Comma-separated 0-based source indices (from data-cite attribute) */
  sourceIndices: number[];
  /** The full citations array from the parent message */
  webCitations: WebCitation[];
}

export const InlineCitationMarker: React.FC<InlineCitationMarkerProps> = ({
  sourceIndices,
  webCitations,
}) => {
  return (
    <>
      {sourceIndices.map((idx) => {
        const citation = webCitations[idx];
        if (!citation) return null;

        const displayIndex = idx + 1; // 1-based for display

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          window.open(citation.url, '_blank', 'noopener,noreferrer');
        };

        return (
          <Button
            key={idx}
            variant="link"
            size="inline"
            onClick={handleClick}
            className="cite-marker-btn"
            title={citation.url}
            aria-label={`Source ${displayIndex}: ${describeCitation(citation).name}`}
          >
            <img
              src={getFaviconUrl(describeCitation(citation).site, 12)}
              alt=""
              className="cite-marker-favicon"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span>{displayIndex}</span>
          </Button>
        );
      })}
    </>
  );
};

export default InlineCitationMarker;
