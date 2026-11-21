/** Mermaid diagrams in the app's own colours: its `base` theme fed the live token values (Mermaid derives its shades from
 *  them, so it needs real colours, not `var()`); read again whenever light or dark changes. */

import type { MermaidOptions } from 'streamdown';
import { cssToken } from '@shared/utils/cssToken';

export function mermaidTheme(): MermaidOptions {
  const text = cssToken('--text-primary');
  const line = cssToken('--text-muted');
  return {
    config: {
      theme: 'base',
      fontFamily: getComputedStyle(document.body).fontFamily,
      themeVariables: {
        background: 'transparent',
        textColor: text,
        primaryColor: cssToken('--bg-layer-2'),
        primaryTextColor: text,
        primaryBorderColor: line,
        secondaryColor: cssToken('--bg-layer-1'),
        tertiaryColor: cssToken('--bg-layer-3'),
        lineColor: line,
        noteBkgColor: cssToken('--bg-layer-1'),
        noteTextColor: text,
      },
    },
  };
}
