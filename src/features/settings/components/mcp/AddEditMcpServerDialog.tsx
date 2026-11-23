/** Add or edit one MCP server: its name and transport, how to reach it, its options; or its JSON, pasted. Everything saves
 *  together, with the form's one save action. */

import React, { useEffect, useState } from 'react';
import { KIT_COPY } from '@config/kitCopy.config';
import { LAYOUT } from '@config/layout.config';
import { MCP_APP_CONFIG, MCP_CONFIG, MCP_COPY, type McpServerConfig } from '@config/mcp.config';
import { CardRow, DrillGroup, Picker, Section, Switch, Text, type DrillGroupPage } from '@shared/ui';
import { FieldRow, FormDialog } from '@shared/components';
import { confirm } from '@shared/stores/confirmStore';
import { errorMessage } from '@shared/utils/errors';
import { EntryList } from '@features/settings/components/shared';
import { EditMcpJsonDialog } from './EditMcpJsonDialog';
import {
  EMPTY_FORM,
  configFromForm,
  connectTimeoutOptions,
  formFromConfig,
  maskUrl,
  parseServerEntries,
  isComplete,
  type McpServerEntry,
  type McpServerForm,
  DEVICE_TRANSPORTS,
} from './mcpServerForm';

const COPY = MCP_COPY.form;

interface AddEditMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Server being edited; null adds a new one. */
  editingName: string | null;
  initial?: McpServerConfig;
  /** The server being edited runs its tools without asking. */
  trusted: boolean;
  /** "Run tools without asking" is on, so every server is allowed and the per-server choice is moot. */
  allowAll: boolean;
  /** Throw to keep the form open and show the message. `trusted`: the form's Always Allow (JSON leaves it as it is). */
  onSave: (entries: McpServerEntry[], trusted?: boolean) => Promise<void>;
  /** An existing server: Delete at the end of its page. */
  onDelete?: () => void;
}

export const AddEditMcpServerDialog: React.FC<AddEditMcpServerDialogProps> = ({
  open,
  onOpenChange,
  editingName,
  initial,
  trusted,
  allowAll,
  onSave,
  onDelete,
}) => {
  const [form, setForm] = useState<McpServerForm>(EMPTY_FORM);
  const [saved, setSaved] = useState<McpServerForm>(EMPTY_FORM);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filled once per opening: the config re-read while the form is open must not replace what was typed.
  useEffect(() => {
    if (!open) return;
    const start = editingName && initial ? formFromConfig(editingName, initial, trusted) : EMPTY_FORM;
    setForm(start);
    setSaved(start);
    setJsonOpen(false);
    setError(null);
  }, [open]);

  const patch = (next: Partial<McpServerForm>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setError(null);
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave([[form.name.trim(), configFromForm(form, initial)]], form.alwaysAllow);
      onOpenChange(false);
    } catch (failure: unknown) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const saveJson = async (text: string) => {
    await onSave(parseServerEntries(text));
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={editingName ? MCP_COPY.editServer : MCP_COPY.addServerTitle}
      dirty={dirty}
      submit={{
        label: saving ? MCP_COPY.connecting : KIT_COPY.save,
        onPress: () => void handleSave(),
        disabled: !dirty || !isComplete(form),
        busy: saving,
      }}
      aside={onDelete && { label: MCP_COPY.deleteServer, tone: 'danger', onPress: onDelete, disabled: saving }}
    >
      <div className="flex flex-col gap-section">
        <ServerRows form={form} patch={patch} autoFocusName={!editingName} />
        <ConnectionRows form={form} patch={patch} error={error} />
        <OptionRows form={form} patch={patch} allowAll={allowAll} />
        <Section>
          <CardRow title={editingName ? MCP_COPY.editJson : MCP_COPY.pasteJson} onOpen={() => setJsonOpen(true)} />
        </Section>
      </div>
      <EditMcpJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        title={editingName ? MCP_COPY.editJson : MCP_COPY.pasteJson}
        value={editingName && initial ? { [editingName]: initial } : undefined}
        placeholder={COPY.jsonPlaceholder}
        onSave={saveJson}
      />
    </FormDialog>
  );
};

// ── Form body ──

interface RowsProps {
  form: McpServerForm;
  patch: (next: Partial<McpServerForm>) => void;
}

const ServerRows: React.FC<RowsProps & { autoFocusName: boolean }> = ({ form, patch, autoFocusName }) => (
  <Section title={COPY.server}>
    <FieldRow typed literal autoFocus={autoFocusName} title={COPY.name} value={form.name} placeholder={COPY.required} onChange={(name) => patch({ name })} />
    <CardRow
      title={COPY.transport}
      actions={
        <div className={LAYOUT.settingsSelect}>
          <Picker
            label={COPY.transport}
            value={form.transport}
            onChange={(value) => patch({ transport: DEVICE_TRANSPORTS.find((t) => t.value === value)?.value ?? form.transport })}
            placeholder=""
            groups={[{ options: [...DEVICE_TRANSPORTS] }]}
          />
        </div>
      }
    />
  </Section>
);

const countText = (entries: readonly unknown[]) => (entries.length ? String(entries.length) : COPY.none);

function commandPages({ form, patch }: RowsProps): DrillGroupPage[] {
  return [
    {
      key: 'args',
      title: COPY.arguments,
      value: countText(form.args),
      render: (title) => (
        <EntryList title={title} entries={form.args.map((arg) => ['', arg])} onChange={(entries) => patch({ args: entries.map(([, arg]) => arg) })} copy={COPY.argument} />
      ),
    },
    {
      key: 'env',
      title: COPY.environment,
      value: countText(form.env),
      render: (title) => <EntryList title={title} entries={form.env} onChange={(env) => patch({ env })} copy={COPY.variable} />,
    },
  ];
}

function remotePages({ form, patch }: RowsProps): DrillGroupPage[] {
  return [{
    key: 'headers',
    title: COPY.headers,
    value: countText(form.headers),
    render: (title) => <EntryList title={title} entries={form.headers} onChange={(headers) => patch({ headers })} copy={COPY.header} />,
  }];
}

/** How to reach the server, by its transport; a failed connection says so under it. */
const ConnectionRows: React.FC<RowsProps & { error: string | null }> = ({ error, ...props }) => {
  const { form, patch } = props;
  const command = form.transport === 'stdio';
  return (
    <DrillGroup
      title={COPY.connection}
      footer={error && <Text as="span" role="alert" variant="caption" tone="danger" className="whitespace-pre-wrap break-words">{error}</Text>}
      rows={command
        ? <FieldRow key="command" literal title={COPY.command} value={form.command} placeholder={COPY.required} onChange={(value) => patch({ command: value })} />
        : <FieldRow key="url" kind="url" title={COPY.url} value={form.url} placeholder={COPY.required} display={maskUrl} onChange={(url) => patch({ url })} />}
      pages={command ? commandPages(props) : remotePages(props)}
    />
  );
};

/** Turning advanced screens on warns first; turning them off needs no asking. */
async function advancedScreensAllowed(name: string, on: boolean): Promise<boolean> {
  const { copy } = MCP_APP_CONFIG;
  if (!on) return false;
  return confirm({
    title: copy.advancedScreensTitle(name),
    description: copy.advancedScreensWarning,
    confirmLabel: copy.advancedScreensAllow,
    tone: 'danger',
  });
}

const OptionRows: React.FC<RowsProps & { allowAll: boolean }> = ({ form, patch, allowAll }) => {
  const toggleScreens = (on: boolean) => {
    advancedScreensAllowed(form.name.trim() || MCP_COPY.addServerTitle, on)
      .then((allowScreenCode) => patch({ allowScreenCode }))
      .catch((error: unknown) => console.error('[AddEditMcpServerDialog] asking failed:', error));
  };
  return (
    <Section title={COPY.options}>
      {form.transport !== 'stdio' && (
        <CardRow
          title={COPY.timeout}
          actions={
            <div className={LAYOUT.settingsSelect}>
              <Picker
                label={COPY.timeout}
                value={form.timeout || MCP_CONFIG.connectTimeout.defaultValue}
                onChange={(value) => patch({ timeout: value === MCP_CONFIG.connectTimeout.defaultValue ? '' : value })}
                placeholder=""
                groups={[{ options: connectTimeoutOptions(form.timeout) }]}
              />
            </div>
          }
        />
      )}
      <CardRow
        title={MCP_COPY.alwaysAllow}
        disabled={allowAll}
        actions={<Switch checked={allowAll || form.alwaysAllow} onCheckedChange={(alwaysAllow) => patch({ alwaysAllow })} aria-label={MCP_COPY.alwaysAllow} />}
      />
      <CardRow
        title={MCP_APP_CONFIG.copy.advancedScreens}
        actions={<Switch checked={form.allowScreenCode} onCheckedChange={toggleScreens} aria-label={MCP_APP_CONFIG.copy.advancedScreens} />}
      />
    </Section>
  );
};
