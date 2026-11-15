import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { PageScroll, Text, TitlebarSpacer } from '@shared/ui';

interface SettingsPageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Controls at the right of the title (Add, time range…). */
  accessory?: React.ReactNode;
}

/** Page title + description of a settings panel (macOS System Settings pane). */
export const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({ title, description, accessory }) => (
  <header className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <Text as="h1" variant="pageTitle" className="flex items-center gap-2">{title}</Text>
      {description && <Text as="p" tone="muted" className="mt-1">{description}</Text>}
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

/** The one frame of every settings pane (titlebar clearance, gutter, header, section spacing). */
export const SettingsPage: React.FC<SettingsPageProps> = ({ layout = 'scroll', children, ...header }) =>
  layout === 'scroll' ? (
    <PageScroll className={`h-full ${LAYOUT.pageGutter} pb-6`}>
      <div className={`${COLUMN} space-y-6`}>
        <SettingsPageHeader {...header} />
        {children}
      </div>
    </PageScroll>
  ) : (
    <div className={`flex h-full flex-col ${LAYOUT.pageGutter} pb-6`}>
      <TitlebarSpacer />
      <div className={`${COLUMN} flex min-h-0 flex-1 flex-col gap-6`}>
        <SettingsPageHeader {...header} />
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
