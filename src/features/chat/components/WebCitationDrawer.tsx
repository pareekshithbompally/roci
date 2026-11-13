/**
 * WebCitationDrawer
 *
 * Slide-in panel showing all web citations for a message.
 * Opens when user clicks "+more" in the Sources tab.
 * Each row links to the source URL.
 */

import React, { useCallback } from 'react';
import { X, Globe, ExternalLink } from 'lucide-react';
import { getFaviconUrl, extractDomain } from '@shared/utils/citationUtils';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';
import type { WebCitation } from '@shared/types';
import { Button } from '@shared/ui';

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
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-300 ${
          isOpen
            ? `${SURFACE.overlay} pointer-events-auto`
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`absolute right-0 inset-y-0 z-20 w-[380px] flex flex-col border-l ${BORDER.default} ${SURFACE.modal} shadow-xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Web sources"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b ${BORDER.default}`}>
          <div className="flex items-center gap-2 min-w-0">
            <Globe className={`w-4 h-4 shrink-0 ${TEXT.faint}`} />
            <h3 className={`text-sm font-semibold ${TEXT.primary}`}>
              Web Sources
            </h3>
            {citations && (
              <span className={`text-[11px] ${TEXT.faint} tabular-nums`}>
                {citations.length}
              </span>
            )}
          </div>
          <Button variant="ghost" size="iconSm" className="shrink-0" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Citation list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
          {citations?.map((citation, i) => (
            <a
              key={`${i}-${citation.url}`}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2.5 px-4 py-2.5 text-xs ${TEXT.secondary} ${SURFACE.hoverSubtle} transition-colors group`}
            >
              <img
                src={getFaviconUrl(citation.url)}
                alt=""
                className="w-4 h-4 shrink-0 rounded-sm"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium ${TEXT.primary} truncate group-hover:underline`}>
                  {citation.title || extractDomain(citation.url)}
                </p>
                <p className={`text-[10px] ${TEXT.faint} truncate mt-0.5`}>
                  {extractDomain(citation.url)}
                </p>
              </div>
              <ExternalLink className={`w-3 h-3 shrink-0 ${TEXT.faint} opacity-0 group-hover:opacity-100 transition-opacity`} />
            </a>
          ))}
        </div>
      </div>
    </>
  );
};

export default WebCitationDrawer;
