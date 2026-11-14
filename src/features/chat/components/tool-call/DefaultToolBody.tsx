import React from 'react';
import { Surface, Text } from '@shared/ui';
import type { ToolCallPart } from './toolCallTitle';

const JSON_INDENT = 2;

/** Pretty-prints text that parses as JSON; returns anything else unchanged. */
function prettyOutput(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, JSON_INDENT);
  } catch {
    return content;
  }
}

interface ToolSectionProps {
  label: string;
  text: string;
  isError?: boolean;
}

function ToolSection({ label, text, isError }: ToolSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label" tone="faint">{label}</Text>
      <Surface variant="subtle" radius="md" className="max-h-48 overflow-auto px-2.5 py-2">
        <Text as="div" variant="mono" tone={isError ? 'danger' : 'muted'} className="whitespace-pre-wrap break-words">
          {text}
        </Text>
      </Surface>
    </div>
  );
}

/** Raw Input (arguments) and Output (result) of any tool call. */
export const DefaultToolBody: React.FC<{ part: ToolCallPart }> = ({ part }) => (
  <div className="flex flex-col gap-2">
    <ToolSection label="Input" text={JSON.stringify(part.arguments, null, JSON_INDENT)} />
    {part.result && (
      <ToolSection label="Output" text={prettyOutput(part.result.content)} isError={part.result.isError} />
    )}
  </div>
);
