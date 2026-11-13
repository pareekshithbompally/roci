/**
 * EditMcpJsonDialog — raw JSON editor for one server or the whole config
 * (Jan's EditJsonMCPserver).
 */

import React, { useEffect, useState } from 'react';
import { COMPONENT } from '@config/theme.config';
import { Button, Input } from '@shared/ui';
import { FormDialog } from '@features/settings/components/shared';

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
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <Input asChild>
        <textarea
          className={COMPONENT.jsonEditor}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          spellCheck={false}
          aria-label={title}
        />
      </Input>
    </FormDialog>
  );
};
