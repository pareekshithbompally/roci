/** Markdown table to text via Streamdown's own converters; formats are data that menus map over. */

import { extractTableDataFromElement, tableDataToCSV, tableDataToMarkdown, tableDataToTSV } from 'streamdown';
import type { TableData } from 'streamdown';

export type TableFormat = 'markdown' | 'csv' | 'tsv';

interface FormatSpec {
  label: string;
  extension: string;
  serialize: (data: TableData) => string;
}

export const TABLE_FORMATS: Record<TableFormat, FormatSpec> = {
  markdown: { label: 'Markdown', extension: 'md', serialize: tableDataToMarkdown },
  csv: { label: 'CSV', extension: 'csv', serialize: tableDataToCSV },
  tsv: { label: 'TSV', extension: 'tsv', serialize: tableDataToTSV },
};

/** Copy offers every format; a saved file is CSV or Markdown (TSV is a paste format). */
export const COPY_FORMATS: TableFormat[] = ['markdown', 'csv', 'tsv'];
export const SAVE_FORMATS: TableFormat[] = ['csv', 'markdown'];

export function serializeTable(table: HTMLTableElement, format: TableFormat): string {
  return TABLE_FORMATS[format].serialize(extractTableDataFromElement(table));
}
