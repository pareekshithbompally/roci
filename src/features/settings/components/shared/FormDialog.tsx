import React from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  type DialogContentProps,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  IconButton,
  Text,
} from '@shared/ui';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Controls left of the close button (e.g. a JSON-mode toggle). */
  headerAction?: React.ReactNode;
  /** Shown above the footer when set. */
  error?: string | null;
  footer?: React.ReactNode;
  size?: DialogContentProps['size'];
  children: React.ReactNode;
}

/** Settings form dialog; outside clicks are ignored so a half-filled form is never lost. */
export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  title,
  headerAction,
  error,
  footer,
  size = 'lg',
  children,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay />
      <DialogContent size={size} scrollable onInteractOutside={(e) => e.preventDefault()} aria-describedby={undefined}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-1 -mr-1">
            {headerAction}
            <DialogClose asChild>
              <IconButton icon={X} label="Close" size="sm" />
            </DialogClose>
          </div>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {error && (
          <Text as="p" role="alert" variant="helper" tone="danger" className="mt-3 whitespace-pre-wrap break-words">
            {error}
          </Text>
        )}
        {footer && <DialogFooter className="shrink-0">{footer}</DialogFooter>}
      </DialogContent>
    </DialogPortal>
  </Dialog>
);
