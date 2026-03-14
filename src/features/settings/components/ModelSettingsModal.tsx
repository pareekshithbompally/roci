/**
 * ModelSettingsModal Component
 *
 * Per-model settings dialog opened from the gear icon in ProvidersPanel.
 * Currently exposes the Tools toggle (toolsEnabled). Designed to be extensible.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@shared/ui';
import { Toggle } from './shared/Toggle';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface ModelSettingsModalProps {
  open: boolean;
  onClose: () => void;
  providerName: string;
  modelId: string;
  /** Current toolsEnabled value for this model */
  toolsEnabled: boolean;
  /** Called with updated toolsEnabled when user saves */
  onSave: (toolsEnabled: boolean) => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  open,
  onClose,
  providerName,
  modelId,
  toolsEnabled: initialToolsEnabled,
  onSave,
}) => {
  const [toolsEnabled, setToolsEnabled] = useState(initialToolsEnabled);

  // Sync local state when the modal re-opens for a different model
  React.useEffect(() => {
    setToolsEnabled(initialToolsEnabled);
  }, [initialToolsEnabled, open]);

  const handleSave = () => {
    onSave(toolsEnabled);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div>
              <DialogTitle>Model Settings</DialogTitle>
              <p className={`mt-0.5 text-xs ${TEXT.muted} font-mono truncate`}>{modelId}</p>
            </div>
            <DialogClose asChild>
              <button className={`${COMPONENT.iconButtonSm} -mr-1`} aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </DialogClose>
          </DialogHeader>

          {/* Divider */}
          <div className={`border-t ${BORDER.default} -mx-6 mb-4`} />

          {/* Tool Use Section */}
          <div className={`${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg} p-4 space-y-3`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-medium ${TEXT.heading}`}>Enable tool calling</p>
              </div>
              <Toggle
                checked={toolsEnabled}
                onChange={setToolsEnabled}
                label="Enable tool calling"
              />
            </div>

            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} leading-relaxed`}>
              When enabled, the model can search your meetings and retrieve context on demand.
              Requires model support for function calling. Most remote models support this.
              For local models, check if your GGUF was trained with tool-use capability.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-5">
            <button
              onClick={handleSave}
              className={`px-4 py-2 ${COMPONENT.primaryButton} ${RADIUS.md} text-sm font-medium`}
            >
              Save
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ModelSettingsModal;
