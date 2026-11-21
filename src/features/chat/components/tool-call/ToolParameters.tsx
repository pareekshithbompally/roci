/** A tool call's arguments as "key value" chips (the model's query, filters, ids), so the user sees what it asked for. */

import React from 'react';
import { Surface, Text } from '@shared/ui';
import type { ToolCallView } from './toolCallView';

/** An argument as one line: text as it is, a list joined, anything nested as JSON; none when empty. */
function shown(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.map(String).join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export const ToolParameters: React.FC<{ part: ToolCallView }> = ({ part }) => {
  const entries = Object.entries(part.arguments).flatMap(([key, value]) => {
    const text = shown(value);
    return text === null ? [] : [[key, text] as const];
  });
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label" tone="faint">Parameters</Text>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {entries.map(([key, text]) => (
          <div key={key} className="flex min-w-0 max-w-full items-center gap-1.5">
            <Text variant="helper" tone="muted" className="shrink-0">{key}</Text>
            <Surface variant="subtle" radius="md" className="min-w-0 px-1.5 py-0.5">
              <Text variant="helper" truncate>{text}</Text>
            </Surface>
          </div>
        ))}
      </div>
    </div>
  );
};
