/** A tool call's arguments as "key value" lines (the model's query, filters, ids), so the user sees what it asked for; key
 *  and value at one size, the value in the text colour. */

import React from 'react';
import { Text } from '@shared/ui';
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
          // Baseline-aligned, so the name and its value read as one line.
          <div key={key} className="flex min-w-0 max-w-full items-baseline gap-1.5">
            <Text variant="helper" tone="muted" className="shrink-0">{key}</Text>
            <Text variant="helper" truncate className="min-w-0">{text}</Text>
          </div>
        ))}
      </div>
    </div>
  );
};
