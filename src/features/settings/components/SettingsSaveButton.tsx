/**
 * SettingsSaveButton Component
 *
 * Conditionally rendered save button that appears only when there are unsaved changes.
 * Uses AnimatePresence for smooth fade-in/slide-up on appear, fade-out on save completion.
 */

import React from 'react';
import { Save } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { COMPONENT, RADIUS, SHADOW, SPACING } from '@config/theme.config';

interface SettingsSaveButtonProps {
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges?: boolean;
  /** Click handler for save button */
  onSave: () => void;
  /** Optional custom save text */
  saveText?: string;
  /** Optional custom saving text */
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
          className="sticky bottom-0 pt-4 pb-2 flex justify-end pointer-events-none"
        >
          <button
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            className={`flex items-center gap-2 ${SPACING.buttonLg} ${RADIUS.md} text-sm font-medium transition-all pointer-events-auto ${SHADOW.float} ${
              hasUnsavedChanges
                ? COMPONENT.accentButton
                : COMPONENT.accentButtonDisabled
            }`}
          >
            <Save className="w-4 h-4" />
            {isSaving ? savingText : saveText}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsSaveButton;
