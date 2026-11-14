/**
 * MarkdownTable — replaces Streamdown's table wrapper (whose controls use
 * shadcn colour classes this app doesn't define, and an `<a download>` the
 * Tauri webview ignores). Built from kit parts only:
 *
 *   [Copy ▾] [Save ▾] [Expand]      ← IconButton + DropdownMenu
 *   ┌ table ┐                       ← styled by .markdown-content (markdown.css)
 *
 * Expand opens a kit Dialog with the same rows. Copy is rich (text + HTML);
 * Save goes through the shared saveTextFile (native save panel).
 */

import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Copy, Download, Maximize2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { copyRichText } from '@shared/utils/clipboard';
import { saveTextFile } from '@services/tauri';
import { COPY_FORMATS, SAVE_FORMATS, TABLE_FORMATS, serializeTable } from './tableExport';
import type { TableFormat } from './tableExport';

const FILE_STEM = 'table';

type TableProps = ComponentProps<'table'> & { node?: unknown };

export function MarkdownTable({ children, node: _node, ...props }: TableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const { showToast } = useToast();

  const copy = async (format: TableFormat) => {
    const table = tableRef.current;
    if (!table) return;
    try {
      await copyRichText(serializeTable(table, format), table.outerHTML);
      showToast(`Copied as ${TABLE_FORMATS[format].label}`, 'success');
    } catch (error: unknown) {
      console.error('[MarkdownTable] Copy failed:', error);
      showToast("Couldn't copy the table", 'error');
    }
  };

  const save = async (format: TableFormat) => {
    const table = tableRef.current;
    if (!table) return;
    const { label, extension } = TABLE_FORMATS[format];
    try {
      const path = await saveTextFile({
        filename: `${FILE_STEM}.${extension}`,
        content: serializeTable(table, format),
        kind: label,
        extension,
      });
      if (path) showToast(`Saved to ${path}`, 'success');
    } catch (error: unknown) {
      console.error('[MarkdownTable] Save failed:', error);
      showToast("Couldn't save the table", 'error');
    }
  };

  const actions = (
    <>
      <FormatMenu icon={Copy} label="Copy table" formats={COPY_FORMATS} onPick={(f) => void copy(f)} />
      <FormatMenu icon={Download} label="Save table" formats={SAVE_FORMATS} onPick={(f) => void save(f)} />
    </>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-end gap-1">
        {actions}
        <IconButton icon={Maximize2} label="Expand table" size="sm" onClick={() => setExpanded(true)} />
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} {...props}>{children}</table>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent size="full" scrollable aria-describedby={undefined}>
            <DialogHeader className="shrink-0">
              <DialogTitle>Table</DialogTitle>
              <div className="flex items-center gap-1 -mr-1">
                {actions}
                <DialogClose asChild>
                  <IconButton icon={X} label="Close" size="sm" />
                </DialogClose>
              </div>
            </DialogHeader>
            {/* Same rows, same styles: the body is a .markdown-content scope. */}
            <div className="markdown-content min-h-0 overflow-auto custom-scrollbar">
              <table {...props}>{children}</table>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}

interface FormatMenuProps {
  icon: LucideIcon;
  label: string;
  formats: TableFormat[];
  onPick: (format: TableFormat) => void;
}

/** An icon button that opens a list of export formats. */
function FormatMenu({ icon, label, formats, onPick }: FormatMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={icon} label={label} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((format) => (
          <DropdownMenuItem key={format} onSelect={() => onPick(format)}>
            {TABLE_FORMATS[format].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
