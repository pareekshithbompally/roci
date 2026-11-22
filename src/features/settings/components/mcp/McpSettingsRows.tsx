/** MCP settings rows: Permissions (run without asking) and Limits (timeout, tool calls per turn, output cap). Per-server trust lives on each server's row. */

import React from 'react';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';
import { CardRow, Picker, Switch } from '@shared/ui';

interface McpSettingsRowsProps {
  settings: McpSettings;
  disabled: boolean;
  onChange: (partial: Partial<McpSettings>) => void;
}

type LimitKey = keyof typeof MCP_CONFIG.limitChoices;

const LIMIT_ROWS: Array<{ key: LimitKey; title: string }> = [
  { key: 'toolCallTimeoutSeconds', title: 'Tool timeout' },
  { key: 'maxToolCalls', title: 'Max tool calls per turn' },
  { key: 'maxToolOutputChars', title: 'Max output' },
];

/** 0 means no limit, so it sorts last. */
const byLimit = (a: number, b: number) => (a || Infinity) - (b || Infinity);

/** A limit's choices, smallest first, with its saved value in order when that isn't one of them. */
function limitOptions(key: LimitKey, current: number) {
  const { values, label } = MCP_CONFIG.limitChoices[key];
  const choices: readonly number[] = values;
  const all = choices.includes(current) ? choices : [...choices, current].sort(byLimit);
  return all.map((value) => ({ value: String(value), label: label(value) }));
}

export const MCP_PERMISSIONS_FOOTER =
  'When off, each tool asks before it runs. To trust one server, turn on Always Allow on its page.';

export const MCP_LIMITS_FOOTER =
  'A tool call stops at the timeout. After the max tool calls, chat stops using tools and answers. Longer tool output is cut.';

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
    {LIMIT_ROWS.map(({ key, title }) => (
      <CardRow
        key={key}
        title={title}
        actions={
          <Picker
            label={title}
            value={String(settings[key])}
            onChange={(value) => onChange({ [key]: Number(value) })}
            placeholder=""
            groups={[{ options: limitOptions(key, settings[key]) }]}
            disabled={disabled}
          />
        }
      />
    ))}
  </>
);
