/** MCP settings rows: Permissions (run without asking) and Limits (timeout, tool calls per turn, output cap). Per-server trust lives on each server's row. */

import React, { useEffect, useState } from 'react';
import { DEFAULT_MCP_SETTINGS, MCP_CONFIG } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';
import { CardRow, Input, Switch } from '@shared/ui';

interface McpSettingsRowsProps {
  settings: McpSettings;
  disabled: boolean;
  onChange: (partial: Partial<McpSettings>) => void;
}

interface NumberSettingProps {
  value: number;
  min: number;
  step?: number;
  fallback: number;
  disabled: boolean;
  label: string;
  onCommit: (value: number) => void;
}

/** Whole-number field that commits on blur (empty → default, invalid or fractional → reverted). */
const NumberSetting: React.FC<NumberSettingProps> = ({ value, min, step, fallback, disabled, label, onCommit }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = draft.trim() === '' ? fallback : Number(draft);
    if (Number.isInteger(next) && next >= min && next !== value) onCommit(next);
    else setDraft(String(value));
  };

  return (
    <Input
      type="number"
      min={min}
      step={step}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      aria-label={label}
      className="w-28"
    />
  );
};

export const MCP_PERMISSIONS_FOOTER =
  'When off, each tool asks before it runs. Choose Always allow when asked to trust a whole server; it shows on that server’s row.';

export const MCP_LIMITS_FOOTER =
  'A tool call stops at the timeout. After the max tool calls, chat stops using tools and answers. Longer output is cut; 0 keeps everything.';

export const McpPermissionsCard: React.FC<McpSettingsRowsProps> = ({ settings, disabled, onChange }) => (
  <CardRow
    title="Run tools without asking"
    actions={
      <Switch
        checked={settings.allowAllTools}
        onCheckedChange={(allowAllTools) => onChange({ allowAllTools })}
        disabled={disabled}
        aria-label="Run tools without asking"
      />
    }
  />
);

export const McpLimitsCard: React.FC<McpSettingsRowsProps> = ({ settings, disabled, onChange }) => (
  <>
    <CardRow
      title="Tool timeout (seconds)"
      actions={
        <NumberSetting
          label="Tool timeout"
          value={settings.toolCallTimeoutSeconds}
          min={MCP_CONFIG.minToolCallTimeoutSeconds}
          fallback={DEFAULT_MCP_SETTINGS.toolCallTimeoutSeconds}
          disabled={disabled}
          onCommit={(toolCallTimeoutSeconds) => onChange({ toolCallTimeoutSeconds })}
        />
      }
    />
    <CardRow
      title="Max tool calls per turn"
      actions={
        <NumberSetting
          label="Max tool calls per turn"
          value={settings.maxToolCalls}
          min={MCP_CONFIG.minToolCalls}
          fallback={DEFAULT_MCP_SETTINGS.maxToolCalls}
          disabled={disabled}
          onCommit={(maxToolCalls) => onChange({ maxToolCalls })}
        />
      }
    />
    <CardRow
      title="Max output characters"
      actions={
        <NumberSetting
          label="Max output characters"
          value={settings.maxToolOutputChars}
          min={0}
          step={MCP_CONFIG.toolOutputCharsStep}
          fallback={DEFAULT_MCP_SETTINGS.maxToolOutputChars}
          disabled={disabled}
          onCommit={(maxToolOutputChars) => onChange({ maxToolOutputChars })}
        />
      }
    />
  </>
);
