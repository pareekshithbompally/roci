/** A file by its type, the same on Mac and iPhone: a page with a folded corner and a coloured band naming the type (PDF,
 *  MD, CSV…), drawn from tokens (`--file-*`) and `FILE_TYPES`. Rows use `sm`, a document's header `md`, an empty place `lg`. */

import { FILE_LABEL_CHARS, FILE_TYPES, OTHER_FILE_TONE } from '@config/fileTypes.config';
import { cn } from './utils';

const SIZE = { sm: 'h-5 w-4', md: 'h-9 w-7', lg: 'h-16 w-14' } as const;

/** The extension of `name` ("Q3 plan.PDF" → "pdf"); empty when it has none. */
const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export interface FileTypeIconProps {
  /** The file's name; its extension picks the band. */
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}

export function FileTypeIcon({ name, size = 'sm', className }: FileTypeIconProps) {
  const extension = extensionOf(name);
  const known = FILE_TYPES[extension];
  const label = known?.label ?? extension.slice(0, FILE_LABEL_CHARS).toUpperCase();
  const tone = known?.tone ?? OTHER_FILE_TONE;
  return (
    <svg viewBox="0 0 28 34" aria-hidden className={cn('shrink-0', SIZE[size], className)}>
      <path d="M3 0.5H19L27.5 9V31.5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5a2 2 0 0 1 2-2Z" fill="var(--file-sheet)" stroke="var(--file-edge)" />
      <path d="M19 0.5V7a2 2 0 0 0 2 2H27.5" fill="var(--file-fold)" stroke="var(--file-edge)" />
      <rect x="0" y="17" width="28" height="10" rx="2" fill={`var(--file-${tone})`} />
      {label && (
        <text x="14" y="24.6" textAnchor="middle" fontSize={label.length > 3 ? 6 : 7} fontWeight={700} fill="var(--file-sheet)" fontFamily="inherit">
          {label}
        </text>
      )}
    </svg>
  );
}
