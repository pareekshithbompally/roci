import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { BackForward, PageScroll, PaneHero, Text, cn } from '@shared/ui';
import { SETTINGS_NAV_ITEMS, usePaneArt } from '@features/settings/components/SettingsNav';
import type { SettingsPanel } from '@shared/stores/appStore';
import { useFormFactor } from '@platform/formFactor';
import { platform } from '@platform/index';
import { useFloatingSidebarControls } from '@shared/hooks/useFloatingSidebarControls';

interface SettingsToolbarProps {
  title: React.ReactNode;
  /** Controls at the right of the title (Add, time range…). */
  accessory?: React.ReactNode;
  /** A drilled-in page (Mac, iPad): the back / forward capsule before the title returns to the page it came from. A phone's
   *  bar has its own. */
  onBack?: () => void;
  /** Goes forward again to the page last left with back (System Settings). */
  onForward?: () => void;
}

const { paneToolbar } = LAYOUT;

/** A pane's toolbar (macOS System Settings): back / forward, the pane's title, its controls. On a Mac it sits in the titlebar,
 *  centred on the traffic lights, and stays put while the page scrolls; its empty space still drags the window. */
const SettingsToolbar: React.FC<SettingsToolbarProps> = ({ title, accessory, onBack, onForward }) => {
  const clearFloating = useFloatingSidebarControls();
  return (
    <header
      className={cn(
        LAYOUT.pageColumn,
        paneToolbar.base,
        'pointer-events-none flex shrink-0 items-center justify-between gap-4',
        platform.hasWindowChrome ? paneToolbar.titlebar : paneToolbar.plain,
        clearFloating && paneToolbar.clearFloating,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {(onBack || onForward) && (
          <div className="pointer-events-auto">
            <BackForward onBack={onBack} onForward={onForward} />
          </div>
        )}
        <Text as="h1" variant="title" truncate>{title}</Text>
      </div>
      {accessory && <div className="pointer-events-auto flex shrink-0 items-center gap-1">{accessory}</div>}
    </header>
  );
};

type SettingsPageProps = Omit<SettingsToolbarProps, 'title'> & {
  /** `scroll` (default): the page scrolls under the toolbar; `fill`: under the header, the body (`flex-1`) fills the pane for self-scrolling columns. */
  layout?: 'scroll' | 'fill';
  children?: React.ReactNode;
} & (
  /** A pane's top level: its sidebar entry sets the title and the header (icon, name, what it covers) that leads the page. */
  | { pane: SettingsPanel; title?: never }
  /** A page drilled into from a pane: its own title, no header. */
  | { title: React.ReactNode; pane?: never }
);

const paneItem = (pane?: SettingsPanel) => SETTINGS_NAV_ITEMS.find((item) => item.id === pane);

/** The header of `pane`, from its sidebar entry (the one place its words are set; its icon comes from `usePaneArt`). */
function Hero({ pane }: { pane?: SettingsPanel }) {
  const art = usePaneArt();
  const item = paneItem(pane);
  return item ? <PaneHero image={art(item.id)} title={item.label} description={item.description} /> : null;
}

/** Phone: the screen's bar already shows the title; the screen scrolls. */
const PhonePage: React.FC<SettingsPageProps> = ({ accessory, pane, children }) => (
  <div className="flex flex-col gap-section px-4 pt-2 pb-6">
    {accessory && <div className="flex items-center justify-end gap-1">{accessory}</div>}
    <Hero pane={pane} />
    {children}
  </div>
);

/** The one frame of every settings pane (toolbar, gutter, section spacing). */
export const SettingsPage: React.FC<SettingsPageProps> = (props) =>
  useFormFactor() === 'phone' ? <PhonePage {...props} /> : <DesktopPage {...props} />;

/** Mac, iPad: the toolbar, then the header and rows in one column at the same place on every pane; `fill` keeps the header
 *  fixed above columns that scroll themselves. */
const DesktopPage: React.FC<SettingsPageProps> = ({ layout = 'scroll', pane, title, children, ...toolbar }) => (
  <div className="flex h-full flex-col">
    <div className={LAYOUT.pageGutter}>
      <SettingsToolbar title={title ?? paneItem(pane)?.label} {...toolbar} />
    </div>
    {layout === 'scroll' ? (
      <PageScroll underTitlebar={false} className={`min-h-0 flex-1 ${LAYOUT.pageGutter} ${paneToolbar.below} pb-6`}>
        <div className={`${LAYOUT.pageColumn} space-y-section`}>
          <Hero pane={pane} />
          {children}
        </div>
      </PageScroll>
    ) : (
      <div className={`flex min-h-0 flex-1 ${LAYOUT.pageGutter} ${paneToolbar.below} pb-6`}>
        <div className={`${LAYOUT.pageColumn} flex min-h-0 flex-1 flex-col gap-section`}>
          <Hero pane={pane} />
          {children}
        </div>
      </div>
    )}
  </div>
);
