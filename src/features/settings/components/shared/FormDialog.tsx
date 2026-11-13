import React from 'react';
import { X } from 'lucide-react';
import { COMPONENT, TEXT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@shared/ui';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Controls left of the close button (e.g. a JSON-mode toggle). */
  headerAction?: React.ReactNode;
  /** Shown above the footer when set. */
  error?: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Settings form dialog: title + close, a scrolling body, inline error, footer.
 * Outside clicks are ignored so a half-filled form is never lost.
 */
export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  title,
  headerAction,
  error,
  footer,
  children,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay />
      <DialogContent className={COMPONENT.dialogScrollable} onInteractOutside={(e) => e.preventDefault()} aria-describedby={undefined}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-1 -mr-1">
            {headerAction}
            <DialogClose asChild>
              <Button variant="ghost" size="iconSm" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto custom-scrollbar space-y-4">{children}</div>
        {error && (
          <p role="alert" className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error} mt-3 whitespace-pre-wrap break-words`}>
            {error}
          </p>
        )}
        <DialogFooter className="shrink-0">{footer}</DialogFooter>
      </DialogContent>
    </DialogPortal>
  </Dialog>
);
