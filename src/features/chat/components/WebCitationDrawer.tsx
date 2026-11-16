/** Slide-in list of a message's web citations, opened from "+more" in the Sources tab. */

import React from 'react';
import { X, Globe, ExternalLink } from 'lucide-react';
import { getFaviconUrl, describeCitation } from '@shared/utils/citationUtils';
import type { WebCitation } from '@shared/types';
import { Drawer, IconButton, Icon, Surface, Text } from '@shared/ui';

interface WebCitationDrawerProps {
  citations: WebCitation[] | null;
  onClose: () => void;
}

export const WebCitationDrawer: React.FC<WebCitationDrawerProps> = ({
  citations,
  onClose,
}) => {
  const isOpen = citations !== null && citations.length > 0;

  return (
    <Drawer open={isOpen} onClose={onClose} label="Web sources">
      {/* Header */}
      <Surface edge="bottom" className="shrink-0 flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon={Globe} size="sm" tone="faint" className="shrink-0" />
          <Text as="h3" variant="headline">
            Web Sources
          </Text>
          {citations && (
            <Text variant="caption" tone="faint" className="tabular-nums">
              {citations.length}
            </Text>
          )}
        </div>
        <IconButton icon={X} label="Close" size="sm" className="shrink-0" onClick={onClose} />
      </Surface>

      {/* Citation list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {citations?.map((citation, i) => {
          const label = describeCitation(citation);
          return (
          <Surface
            as="a"
            key={`${i}-${citation.url}`}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            interactive
            className="group flex items-center gap-2.5 px-4 py-2.5"
          >
            <img
              src={getFaviconUrl(label.site)}
              alt=""
              className="w-4 h-4 shrink-0"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0 flex-1">
              <Text as="p" variant="label" truncate className="group-hover:underline">
                {label.name}
              </Text>
              {label.detail && (
                <Text as="p" variant="caption" tone="faint" truncate className="mt-0.5">
                  {label.detail}
                </Text>
              )}
            </div>
            <Icon icon={ExternalLink} size="xs" tone="faint" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Surface>
          );
        })}
      </div>
    </Drawer>
  );
};

export default WebCitationDrawer;
