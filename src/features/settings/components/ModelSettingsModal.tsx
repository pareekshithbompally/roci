/**
 * ModelSettingsModal Component
 *
 * Per-model settings dialog opened from the gear icon in ProvidersPanel.
 * Currently exposes the Tools toggle (toolsEnabled). Designed to be extensible.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card, CardRow, Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, IconButton, Switch, Text } from '@shared/ui';

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
        <DialogContent size="sm">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle>Model Settings</DialogTitle>
              <Text as="p" variant="mono" tone="muted" truncate className="mt-0.5">{modelId}</Text>
            </div>
            <DialogClose asChild>
              <IconButton icon={X} label="Close" size="sm" className="-mr-1" />
            </DialogClose>
          </DialogHeader>

          <Card>
            <CardRow
              title="Enable tool calling"
              description="When enabled, the model can search your meetings and retrieve context on demand. Requires model support for function calling. Most remote models support this. For local models, check that the model supports tool calling in your local server."
              actions={<Switch size="sm" checked={toolsEnabled} onCheckedChange={setToolsEnabled} aria-label="Enable tool calling" />}
            />
          </Card>

          <DialogFooter>
            <Button variant="primary" size="md" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ModelSettingsModal;
