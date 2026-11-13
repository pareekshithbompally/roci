/**
 * ModelSettingsModal Component
 *
 * Per-model settings dialog opened from the gear icon in ProvidersPanel.
 * Currently exposes the Tools toggle (toolsEnabled). Designed to be extensible.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogContent, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@shared/ui';
import { Toggle } from './shared/Toggle';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
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
              <p className={`mt-0.5 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} font-mono truncate`}>{modelId}</p>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="iconSm" className="-mr-1" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </DialogHeader>

          {/* Divider */}
          <div className={`border-t ${BORDER.default} -mx-6 mb-4`} />

          {/* Tool Use Section */}
          <div className={`${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg} p-4 space-y-3`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>Enable tool calling</p>
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
              For local models, check that the model supports tool calling in your local server.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-5">
            <Button variant="primary" size="md" onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ModelSettingsModal;
