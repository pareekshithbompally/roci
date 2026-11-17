/** A link in rendered markdown: web and mail links open in the default browser or mail app through the app's opener,
 *  as native apps do; any other target (javascript:, file:, relative) is shown as plain text, never followed. */

import React from 'react';
import { openUrl } from '@services/tauri';

type MarkdownLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

const OPENABLE = new Set(['http:', 'https:', 'mailto:']);

function openable(href: string | undefined): href is string {
  if (!href) return false;
  try {
    return OPENABLE.has(new URL(href).protocol);
  } catch {
    return false; // relative or malformed
  }
}

export const MarkdownLink: React.FC<MarkdownLinkProps> = ({ href, children, node: _node, target: _target, ...rest }) => {
  if (!openable(href)) return <span>{children}</span>;
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void openUrl(href);
      }}
    >
      {children}
    </a>
  );
};
