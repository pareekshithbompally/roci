import React from 'react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT, SPACING } from '@config/theme.config';

interface SettingsSectionProps {
  title: string;
  icon?: React.FC<{ className?: string }>;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon: Icon,
  children,
}) => (
  <div className={SPACING.fieldGap}>
    <h5 className={`${TYPOGRAPHY_CLASSES.settingsLabel} ${TEXT.faint} flex items-center gap-1.5`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {title}
    </h5>
    {children}
  </div>
);
