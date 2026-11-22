/** The host's look on Roci's tokens: its light or dark as Roci's theme class, and each spec variable it sends onto the
 *  token Roci maps it from (the same table the in-app host sends with, read the other way). */

import { useEffect } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { useDocumentTheme, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import { MCP_APP_CONFIG } from '@config/mcp.config';

export function useScreenTheme(app: App | null): void {
  useHostStyles(app, app?.getHostContext());
  const theme = useDocumentTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme !== 'dark');
    const sent = getComputedStyle(root);
    for (const [variable, token] of Object.entries(MCP_APP_CONFIG.styleVariables)) {
      const value = sent.getPropertyValue(variable).trim();
      if (value) root.style.setProperty(token, value);
    }
  }, [theme, app]);
}
