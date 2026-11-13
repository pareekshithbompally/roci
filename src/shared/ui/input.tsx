import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from './utils';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';

/**
 * Canonical text field. Renders an <input> by default; pass `asChild` to
 * style a <textarea> (or any field) with the same recipe.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  asChild?: false;
}

export interface InputAsChildProps {
  asChild: true;
  children: React.ReactElement;
  className?: string;
  ref?: React.Ref<Element>;
  [key: string]: unknown;
}

/** Placeholder color derived from the faint text token (stays in sync). */
const FAINT_PLACEHOLDER = TEXT.faint
  .split(' ')
  .map((c) => `placeholder:${c.replace(/^dark:/, 'dark:placeholder:')}`)
  .join(' ');

const INPUT_CLASSES = `${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md} outline-none ${BORDER.inputFocus} transition-all ${TEXT.primary} text-[13px] leading-[1.5] px-3 py-2 ${FAINT_PLACEHOLDER} disabled:opacity-50 disabled:cursor-not-allowed w-full resize-none`;

export function Input(props: InputProps | InputAsChildProps) {
  const { asChild, className, ...rest } = props as InputProps & {
    asChild?: boolean;
    className?: string;
  };
  if (asChild) {
    return <Slot className={cn(INPUT_CLASSES, className)} {...rest} />;
  }
  return <input className={cn(INPUT_CLASSES, className)} {...rest} />;
}
