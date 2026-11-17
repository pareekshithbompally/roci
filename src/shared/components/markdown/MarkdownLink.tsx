/** A link in rendered markdown: opens in the default browser (Mac) or Safari (iPhone) through the app's opener, as native
 *  apps do — not Streamdown's own confirm dialog, which isn't part of the app's design. */

import React from 'react';
import { openUrl } from '@services/tauri';

type MarkdownLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

export const MarkdownLink: React.FC<MarkdownLinkProps> = ({ href, children, node: _node, ...rest }) => (
  <a
    {...rest}
    href={href}
    onClick={(e) => {
      if (!href) return;
      e.preventDefault();
      void openUrl(href);
    }}
  >
    {children}
  </a>
);
