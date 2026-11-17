import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { LAYOUT } from '@config/layout.config';
import { IconButton, PageScroll, Text, TitlebarSpacer } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';

interface SettingsPageHeaderProps {
  title: React.ReactNode;
  /** Controls at the right of the title (Add, time range…). */
  accessory?: React.ReactNode;
  /** A drilled-in page (Mac, iPad): a back button before the title returns to the page it came from. A phone's bar has its own. */
  onBack?: () => void;
}

/** Page title of a settings panel (macOS System Settings pane); what a group does reads in its footer, not under the title. */
export const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({ title, accessory, onBack }) => (
  <header className="flex items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-2">
      {onBack && <IconButton icon={ChevronLeft} label="Back" size="sm" onClick={onBack} />}
      <div className="min-w-0">
        <Text as="h1" variant="pageTitle" className="flex items-center gap-2">{title}</Text>
      </div>
    </div>
    {accessory && <div className="flex items-center gap-1 shrink-0">{accessory}</div>}
  </header>
);

interface SettingsPageProps extends SettingsPageHeaderProps {
  /** `scroll` (default): whole pane scrolls; `fill`: header fixed, body fills for self-scrolling columns. */
  layout?: 'scroll' | 'fill';
  children?: React.ReactNode;
}

/** The page column every pane shares: centred, its header the same distance from the titlebar. */
const COLUMN = `${LAYOUT.pageColumn} pt-6`;

/** Phone: the screen's bar already shows the title; the screen scrolls. */
const PhonePage: React.FC<SettingsPageProps> = ({ accessory, children }) => (
  <div className="flex flex-col gap-section px-4 pt-2 pb-6">
    {accessory && <div className="flex items-center justify-end gap-1">{accessory}</div>}
    {children}
  </div>
);

/** The one frame of every settings pane (titlebar clearance, gutter, header, section spacing). */
export const SettingsPage: React.FC<SettingsPageProps> = (props) =>
  useFormFactor() === 'phone' ? <PhonePage {...props} /> : <DesktopPage {...props} />;

const DesktopPage: React.FC<SettingsPageProps> = ({ layout = 'scroll', children, ...header }) =>
  layout === 'scroll' ? (
    <PageScroll className={`h-full ${LAYOUT.pageGutter} pb-6`}>
      <div className={`${COLUMN} space-y-section`}>
        <SettingsPageHeader {...header} />
        {children}
      </div>
    </PageScroll>
  ) : (
    <div className={`flex h-full flex-col ${LAYOUT.pageGutter} pb-6`}>
      <TitlebarSpacer />
      <div className={`${COLUMN} flex min-h-0 flex-1 flex-col gap-section`}>
        <SettingsPageHeader {...header} />
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
