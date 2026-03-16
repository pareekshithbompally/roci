/**
 * ProgressBar — shared progress bar for ActivityTray rows.
 * Extracted from DownloadBanner styling.
 */

import React from 'react';
import { motion } from 'framer-motion';

interface ProgressBarProps {
  /** 0-100 percentage, or null for indeterminate */
  percent: number | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percent }) => (
  <div
    className="w-full h-1 rounded-sm overflow-hidden"
    style={{ backgroundColor: 'var(--border-strong)' }}
  >
    {percent !== null ? (
      <motion.div
        className="h-full rounded-sm"
        style={{ backgroundColor: 'var(--text-primary)' }}
        initial={false}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    ) : (
      <motion.div
        className="h-full rounded-sm w-1/4"
        style={{ backgroundColor: 'var(--text-primary)' }}
        animate={{ x: ['0%', '200%', '0%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    )}
  </div>
);
