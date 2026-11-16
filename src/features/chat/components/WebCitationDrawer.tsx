/** Slide-in list of a message's web citations, opened from "+more" in the Sources tab. */

import React, { useCallback } from 'react';
import { X, Globe, ExternalLink } from 'lucide-react';
import { getFaviconUrl, describeCitation } from '@shared/utils/citationUtils';
import type { WebCitation } from '@shared/types';
import { IconButton, Icon, Surface, Text } from '@shared/ui';

interface WebCitationDrawerProps {
  citations: WebCitation[] | null;
  onClose: () => void;
}

export const WebCitationDrawer: React.FC<WebCitationDrawerProps> = ({
  citations,
  onClose,
}) => {
  const isOpen = citations !== null && citations.length > 0;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <Surface
        variant="scrim"
        className={`absolute inset-0 z-10 transition-opacity duration-300 ${isOpen ? 'pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <Surface
        variant="card"
        edge="left"
        className={`absolute right-0 inset-y-0 z-20 w-96 flex flex-col transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Web sources"
        aria-modal="true"
      >
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
      </Surface>
    </>
  );
};

export default WebCitationDrawer;
