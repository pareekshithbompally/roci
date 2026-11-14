/**
 * McpRuntimeCard — tool permissions and runtime limits (Jan's MCP settings
 * card: allow-all, saved permissions with revoke, timeout, output cap).
 * Renders the rows of a `Section`.
 */

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

export const McpRuntimeCard: React.FC<McpRuntimeCardProps> = ({ settings, disabled, onChange }) => (
  <>
    <CardRow
      title="Allow all MCP tool permissions"
      description="Run every MCP tool without asking first. Otherwise each tool asks, and “Always allow” saves a permission here."
      actions={
        <Switch
          size="sm"
          checked={settings.allowAllTools}
          onCheckedChange={(allowAllTools) => onChange({ allowAllTools })}
          disabled={disabled}
          aria-label="Allow all MCP tool permissions"
        />
      }
    />
    {settings.trustedServers.map((server) => (
      <CardRow
        key={server}
        title={`Always allow ${server}`}
        description="Saved permission: every tool from this server runs without asking."
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
      title="Tool call timeout (seconds)"
      description="How long a single tool call may run before it is stopped."
      actions={
        <NumberSetting
          label="Tool call timeout"
          value={settings.toolCallTimeoutSeconds}
          min={MCP_CONFIG.minToolCallTimeoutSeconds}
          fallback={DEFAULT_MCP_SETTINGS.toolCallTimeoutSeconds}
          disabled={disabled}
          onCommit={(toolCallTimeoutSeconds) => onChange({ toolCallTimeoutSeconds })}
        />
      }
    />
    <CardRow
      title="Max tool output characters"
      description="Longer results are cut before they reach the model. 0 keeps everything."
      actions={
        <NumberSetting
          label="Max tool output characters"
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
