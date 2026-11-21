/** A value typed into a settings row (macOS System Settings): its name on the left, a compact field right-aligned. */

import React from 'react';
import { CardRow } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';

interface FieldRowProps {
  title: React.ReactNode;
  /** The field: an `Input size="sm"` (or SecretInput). */
  children: React.ReactNode;
}

export const FieldRow: React.FC<FieldRowProps> = ({ title, children }) => (
  <CardRow title={title} actions={<div className={LAYOUT.settingsField}>{children}</div>} />
);
