/** How each kind of file you give Roci is marked (kit FileTypeIcon): the word on its band and the colour behind it
 *  (tokens.css `--file-*`), by extension; any other file shows its own extension on the plain band. */

export type FileTone = 'pdf' | 'md' | 'txt' | 'csv' | 'json';

export const FILE_TYPES: Record<string, { label: string; tone: FileTone }> = {
  pdf: { label: 'PDF', tone: 'pdf' },
  md: { label: 'MD', tone: 'md' },
  markdown: { label: 'MD', tone: 'md' },
  txt: { label: 'TXT', tone: 'txt' },
  csv: { label: 'CSV', tone: 'csv' },
  json: { label: 'JSON', tone: 'json' },
};

/** The band of a file of an unknown kind. */
export const OTHER_FILE_TONE: FileTone = 'txt';

/** The longest extension a band spells out. */
export const FILE_LABEL_CHARS = 4;
