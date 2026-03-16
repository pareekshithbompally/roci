/**
 * SettingsSaveButton Component
 *
 * Absolutely positioned save bar that overlays the bottom of the settings content.
 * Uses a gradient backdrop so content fades out underneath — no layout shift.
 */

import React from 'react';
import { Save } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { COMPONENT, RADIUS, SHADOW, SPACING, LAYOUT } from '@config/theme.config';

interface SettingsSaveButtonProps {
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
  saveText?: string;
  savingText?: string;
}

export const SettingsSaveButton: React.FC<SettingsSaveButtonProps> = ({
  isSaving = false,
  hasUnsavedChanges = false,
  onSave,
  saveText = 'Save Changes',
  savingText = 'Saving...',
}) => {
  const isVisible = hasUnsavedChanges || isSaving;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className={`absolute bottom-0 left-0 right-0 ${LAYOUT.settingsPadding} pb-4 pt-8 pointer-events-none bg-gradient-to-t from-parchment-100 via-parchment-100/80 to-transparent dark:from-night-950 dark:via-night-950/80 dark:to-transparent`}
        >
          <div className={`${LAYOUT.settingsMaxWidth} mx-auto flex justify-end`}>
            <button
              onClick={onSave}
              disabled={isSaving || !hasUnsavedChanges}
              className={`pointer-events-auto flex items-center gap-2 ${SPACING.buttonLg} ${RADIUS.md} text-sm font-medium transition-all ${SHADOW.float} ${
                hasUnsavedChanges
                  ? COMPONENT.accentButton
                  : COMPONENT.accentButtonDisabled
              }`}
            >
              <Save className="w-4 h-4" />
              {isSaving ? savingText : saveText}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsSaveButton;
