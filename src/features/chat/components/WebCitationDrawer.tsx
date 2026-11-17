/** Slide-in list of a message's web citations, opened from "+more" in the Sources tab. */

import React from 'react';
import { X, Globe, ExternalLink } from 'lucide-react';
import { getFaviconUrl, describeCitation } from '@shared/utils/citationUtils';
import type { WebCitation } from '@shared/types';
import { CardRow, Drawer, IconButton, Icon, Section, SheetBody, Surface, Text } from '@shared/ui';
import { openUrl } from '@services/tauri';

interface WebCitationDrawerProps {
  citations: WebCitation[] | null;
  onClose: () => void;
}

/** A favicon that fails to load leaves its slot empty instead of a broken image. */
const hideBrokenImage = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.classList.add('invisible'); };

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

      {/* Citation list: one grouped card of sources (iOS / macOS list), each opening in the browser */}
      <SheetBody>
        <Section>
          {citations?.map((citation, i) => {
            const label = describeCitation(citation);
            return (
              <CardRow
                key={`${i}-${citation.url}`}
                leading={<img src={getFaviconUrl(label.site)} alt="" className="h-4 w-4 shrink-0" loading="lazy" onError={hideBrokenImage} />}
                title={label.name}
                description={label.detail ?? undefined}
                onPress={() => void openUrl(citation.url)}
                actions={<Icon icon={ExternalLink} size="xs" tone="faint" />}
              />
            );
          })}
        </Section>
      </SheetBody>
    </Drawer>
  );
};

export default WebCitationDrawer;
