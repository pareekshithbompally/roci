import React from 'react';
import { openUrl } from '@services/tauri';
import { Button } from '@shared/ui';

/** Parse markdown-style [text](url) links into React elements (field help, section footers). */
export function renderWithLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return part;
    const [, label, href] = match;
    return (
      <Button
        key={i}
        variant="link"
        size="inline"
        onClick={() => void openUrl(href)}
      >
        {label}
      </Button>
    );
  });
}
