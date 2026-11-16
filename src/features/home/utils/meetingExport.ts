/** A meeting as a file to save: the current tab or the whole session, as text, Markdown, HTML or JSON. */

import type { ProcessedResult } from '@shared/types';

export type ExportFormat = 'txt' | 'md' | 'html' | 'json';
export type ExportScope = 'current' | 'all';
export type ExportPart = 'summary' | 'transcript';

/** Save-panel filter label per format. */
export const EXPORT_KIND: Record<ExportFormat, string> = { txt: 'Plain Text', md: 'Markdown', html: 'HTML', json: 'JSON' };

const partOf = (result: ProcessedResult, part: ExportPart): string => (part === 'summary' ? result.summary : result.transcript);

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body style="font-family: sans-serif; max-width: 800px; margin: 2rem auto; line-height: 1.6;">${body}</body></html>`;
}

function wholeSession(result: ProcessedResult, format: ExportFormat): string {
  const summary = partOf(result, 'summary');
  const transcript = partOf(result, 'transcript');
  if (format === 'html') {
    return htmlPage(result.title, `<h1>${result.title}</h1><section><h2>Summary</h2><pre>${summary}</pre></section><section><h2>Transcript</h2><pre>${transcript}</pre></section>`);
  }
  return `# ${result.title}\n\n## Summary\n${summary}\n\n## Transcript\n${transcript}`;
}

function onePart(result: ProcessedResult, format: ExportFormat, part: ExportPart): string {
  const text = partOf(result, part);
  return format === 'html' ? htmlPage(result.title, `<h1>${result.title} - ${part}</h1><pre>${text}</pre>`) : text;
}

/** The file name and contents for one export. */
export function buildExport(
  result: ProcessedResult,
  format: ExportFormat,
  scope: ExportScope,
  part: ExportPart,
): { filename: string; content: string } {
  const base = result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const content =
    format === 'json' ? JSON.stringify(result, null, 2)
      : scope === 'all' ? wholeSession(result, format)
        : onePart(result, format, part);
  return { filename: `${base}_${scope}.${format}`, content };
}
