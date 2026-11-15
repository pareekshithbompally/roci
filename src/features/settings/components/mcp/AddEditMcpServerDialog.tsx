/** Add or edit one MCP server by form (STDIO / HTTP / SSE, args, env, headers, timeout) or pasted JSON. */

import React, { useEffect, useState } from 'react';
import { Braces } from 'lucide-react';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { Button, IconButton, Tabs, Text, Textarea } from '@shared/ui';
import { FormDialog, KeyValueEditor, SettingsInput, StringListEditor } from '@features/settings/components/shared';
import {
  EMPTY_FORM,
  configFromForm,
  formFromConfig,
  parseServerEntries,
  validateForm,
  type McpServerEntry,
  type McpServerForm,
} from './mcpServerForm';

const JSON_PLACEHOLDER = `{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@scope/mcp-server"],
    "env": { "API_KEY": "…" }
  }
}`;

interface AddEditMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Server being edited; null adds a new one. */
  editingName: string | null;
  initial?: McpServerConfig;
  /** Throw to keep the dialog open and show the message. */
  onSave: (entries: McpServerEntry[]) => Promise<void>;
}

export const AddEditMcpServerDialog: React.FC<AddEditMcpServerDialogProps> = ({
  open,
  onOpenChange,
  editingName,
  initial,
  onSave,
}) => {
  const [form, setForm] = useState<McpServerForm>(EMPTY_FORM);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const editing = editingName && initial;
    setForm(editing ? formFromConfig(editingName, initial) : EMPTY_FORM);
    setJsonText(editing ? JSON.stringify({ [editingName]: initial }, null, 2) : '');
    setJsonMode(false);
    setError(null);
  }, [open, editingName, initial]);

  const patch = (next: Partial<McpServerForm>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setError(null);
  };

  const collectEntries = (): McpServerEntry[] => {
    if (jsonMode) return parseServerEntries(jsonText);
    const problem = validateForm(form);
    if (problem) throw new Error(problem);
    return [[form.name.trim(), configFromForm(form, initial)]];
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(collectEntries());
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
      title={editingName ? 'Edit MCP server' : 'Add MCP server'}
      error={error}
      headerAction={
        <IconButton
          icon={Braces}
          label="Paste server JSON"
          size="sm"
          variant={jsonMode ? 'secondary' : 'ghost'}
          onClick={() => { setJsonMode((v) => !v); setError(null); }}
          aria-pressed={jsonMode}
        />
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Connecting…' : 'Save'}</Button>
        </>
      }
    >
      {jsonMode ? (
        <Textarea
          variant="code"
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setError(null); }}
          placeholder={JSON_PLACEHOLDER}
          spellCheck={false}
          aria-label="Server JSON"
        />
      ) : (
        <ServerFormFields form={form} patch={patch} autoFocusName={!editingName} />
      )}
    </FormDialog>
  );
};

// ── Form body ──

interface ServerFormFieldsProps {
  form: McpServerForm;
  patch: (next: Partial<McpServerForm>) => void;
  autoFocusName: boolean;
}

const ServerFormFields: React.FC<ServerFormFieldsProps> = ({ form, patch, autoFocusName }) => (
  <>
    <SettingsInput
      label="Server name"
      value={form.name}
      onChange={(e) => patch({ name: e.target.value })}
      placeholder="e.g. filesystem"
      autoFocus={autoFocusName}
    />

    <div className="space-y-2">
      <Text variant="bodyStrong" tone="muted">Transport</Text>
      <div>
        <Tabs items={MCP_CONFIG.transports} value={form.transport} onValueChange={(transport) => patch({ transport })} />
      </div>
    </div>

    {form.transport === 'stdio' ? (
      <>
        <SettingsInput
          label="Command"
          value={form.command}
          onChange={(e) => patch({ command: e.target.value })}
          placeholder="npx, uvx, node, /path/to/binary"
        />
        <StringListEditor
          label="Arguments"
          values={form.args}
          onChange={(args) => patch({ args })}
          placeholder={(i) => `Argument ${i + 1}`}
        />
        <KeyValueEditor
          label="Environment variables"
          pairs={form.env}
          onChange={(env) => patch({ env })}
          keyPlaceholder="KEY"
          valuePlaceholder="Value"
        />
      </>
    ) : (
      <>
        <SettingsInput
          label="URL"
          value={form.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="https://example.com/mcp"
        />
        <KeyValueEditor
          label="Headers"
          pairs={form.headers}
          onChange={(headers) => patch({ headers })}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
        <SettingsInput
          label="Connect timeout (seconds)"
          type="number"
          min={1}
          value={form.timeout}
          onChange={(e) => patch({ timeout: e.target.value })}
          placeholder="Optional"
        />
      </>
    )}
  </>
);
