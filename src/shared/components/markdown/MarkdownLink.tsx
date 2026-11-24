/** A link in rendered markdown: web and mail links open in the default browser or mail app through the app's opener,
 *  as native apps do; any other target (javascript:, file:, relative) is shown as plain text, never followed. A source the
 *  reply cites (titled `SOURCE_LINK_TITLE`) is a pill named by its site. */

import React from 'react';
import { openUrl } from '@services/tauri';
import { Badge } from '@shared/ui';
import { SOURCE_LINK_TITLE } from '@config/chat.config';

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

export const MarkdownLink: React.FC<MarkdownLinkProps> = ({ href, title, children, node: _node, target: _target, ...rest }) => {
  if (!openable(href)) return <span>{children}</span>;
  const source = title === SOURCE_LINK_TITLE;
  return (
    <a
      {...rest}
      href={href}
      title={source ? href : title}
      data-source={source || undefined}
      onClick={(e) => {
        e.preventDefault();
        void openUrl(href);
      }}
    >
      {source ? <Badge dot={false} tinted>{children}</Badge> : children}
    </a>
  );
};
