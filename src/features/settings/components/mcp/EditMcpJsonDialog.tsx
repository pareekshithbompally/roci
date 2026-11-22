/** Raw JSON editor for one MCP server or the whole config. */

import { KIT_COPY } from '@config/kitCopy.config';
import { MCP_COPY } from '@config/mcp.config';
import React, { useEffect, useState } from 'react';
import { Textarea } from '@shared/ui';
import { FormDialog } from '@shared/components';

interface EditMcpJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: unknown;
  /** Throw to keep the dialog open and show the message. */
  onSave: (parsed: unknown) => Promise<void>;
}

export const EditMcpJsonDialog: React.FC<EditMcpJsonDialogProps> = ({ open, onOpenChange, title, value, onSave }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(JSON.stringify(value, null, 2));
    setError(null);
  }, [open, value]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(JSON.parse(text));
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof SyntaxError ? `Invalid JSON: ${err.message}` : err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={title}
      error={error}
      submit={{ label: saving ? MCP_COPY.saving : KIT_COPY.save, onPress: () => void handleSave(), busy: saving }}
    >
      <Textarea
        variant="code"
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        spellCheck={false}
        aria-label={title}
      />
    </FormDialog>
  );
};
