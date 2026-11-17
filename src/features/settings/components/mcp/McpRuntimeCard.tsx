/** MCP tool permissions and runtime limits (allow-all, saved permissions, timeout, output cap) as Section rows; `MCP_RUNTIME_FOOTER` explains them. */

import React, { useEffect, useState } from 'react';
import { DEFAULT_MCP_SETTINGS, MCP_CONFIG } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';
import { Button, CardRow, Input, Switch } from '@shared/ui';

interface McpRuntimeCardProps {
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

/** Number field that commits on blur (empty → default, invalid → reverted). */
const NumberSetting: React.FC<NumberSettingProps> = ({ value, min, step, fallback, disabled, label, onCommit }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = draft.trim() === '' ? fallback : Number(draft);
    if (Number.isFinite(next) && next >= min && next !== value) onCommit(next);
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

/** Footer for the section holding these rows. */
export const MCP_RUNTIME_FOOTER = 'A tool call stops at the timeout. Longer output is cut; 0 keeps everything.';

export const McpRuntimeCard: React.FC<McpRuntimeCardProps> = ({ settings, disabled, onChange }) => (
  <>
    <CardRow
      title="Run tools without asking"
      actions={
        <Switch
          size="sm"
          checked={settings.allowAllTools}
          onCheckedChange={(allowAllTools) => onChange({ allowAllTools })}
          disabled={disabled}
          aria-label="Run tools without asking"
        />
      }
    />
    {settings.trustedServers.map((server) => (
      <CardRow
        key={server}
        title={`Always allow ${server}`}
        actions={
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onChange({ trustedServers: settings.trustedServers.filter((s) => s !== server) })}
          >
            Revoke
          </Button>
        }
      />
    ))}
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
