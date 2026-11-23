import React from 'react';
import { ContentBlock, Text } from '@shared/ui';
import type { ToolCallView } from './toolCallView';
import { ToolParameters } from './ToolParameters';

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
    <ContentBlock label={label} padded>
      <Text as="div" variant="mono" tone={isError ? 'danger' : 'primary'} className="max-h-48 overflow-auto whitespace-pre-wrap break-words">
        {text}
      </Text>
    </ContentBlock>
  );
}

/** Any tool call's Output (its result), then its Parameters (the arguments it was called with). */
export const DefaultToolBody: React.FC<{ part: ToolCallView }> = ({ part }) => (
  <div className="flex flex-col gap-2">
    {part.result && (
      <ToolSection label="Output" text={prettyOutput(part.result.content)} isError={part.result.isError} />
    )}
    <ToolParameters part={part} />
  </div>
);
