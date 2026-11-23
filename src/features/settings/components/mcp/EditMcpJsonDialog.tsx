/** Raw JSON editor for one MCP server or the whole config. */

import { KIT_COPY } from '@config/kitCopy.config';
import { MCP_COPY } from '@config/mcp.config';
import React, { useEffect, useState } from 'react';
import { Textarea } from '@shared/ui';
import { FormDialog } from '@shared/components';
import { errorMessage } from '@shared/utils/errors';

interface EditMcpJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What it starts from; undefined starts empty. */
  value: unknown;
  placeholder?: string;
  /** Throw to keep the dialog open and show the message. */
  onSave: (text: string) => Promise<void>;
}

export const EditMcpJsonDialog: React.FC<EditMcpJsonDialogProps> = ({ open, onOpenChange, title, value, placeholder, onSave }) => {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filled once per opening: a config re-read while it is open must not replace what was typed.
  useEffect(() => {
    if (!open) return;
    const start = value === undefined ? '' : JSON.stringify(value, null, 2);
    setText(start);
    setSaved(start);
    setError(null);
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      onOpenChange(false);
    } catch (failure: unknown) {
      setError(failure instanceof SyntaxError ? `${MCP_COPY.invalidJson} ${failure.message}` : errorMessage(failure));
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
      dirty={text !== saved}
      submit={{ label: saving ? MCP_COPY.saving : KIT_COPY.save, onPress: () => void handleSave(), disabled: text === saved || !text.trim(), busy: saving }}
    >
      <Textarea
        variant="code"
        value={text}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        spellCheck={false}
        aria-label={title}
      />
    </FormDialog>
  );
};
