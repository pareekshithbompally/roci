import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { Text } from '@shared/ui';

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

/** A scrolling settings panel: header, then its `Section`s. */
export const SettingsPage: React.FC<SettingsPageHeaderProps & { children?: React.ReactNode }> = ({ children, ...header }) => (
  <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      <SettingsPageHeader {...header} />
      {children}
    </div>
  </div>
);
