/**
 * Surface Component
 *
 * Composes SURFACE + BORDER tokens into a single element.
 * Useful for layout shells; leaf components can import tokens directly.
 */

import React from 'react';
import { SURFACE, BORDER } from '@config/theme.config';

type SurfaceVariant = keyof typeof SURFACE;
type BorderVariant = keyof typeof BORDER;

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: SurfaceVariant;
  border?: BorderVariant;
  as?: keyof JSX.IntrinsicElements;
  children: React.ReactNode;
}

export const Surface: React.FC<SurfaceProps> = ({
  variant,
  border,
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}) => {
  const classes = [
    SURFACE[variant],
    border ? `border ${BORDER[border]}` : '',
    className,
  ].filter(Boolean).join(' ');

  return React.createElement(Tag, { className: classes, ...rest }, children);
};
