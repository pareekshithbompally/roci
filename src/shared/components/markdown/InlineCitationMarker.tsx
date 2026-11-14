/**
 * InlineCitationMarker
 *
 * A superscript badge rendered inline within markdown text.
 * Shows favicon + citation number (e.g. [🌐 1]).
 *
 * On hover: tooltip with source URL
 * On click: opens source URL in a new tab
 */

import React from 'react';
import { getFaviconUrl } from '@shared/utils/citationUtils';
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
            aria-label={`Source ${displayIndex}: ${citation.title || citation.url}`}
          >
            <img
              src={getFaviconUrl(citation.url, 12)}
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
