/** The single markdown renderer: Streamdown for streaming and static content, so finishing never shifts layout. */

import React, { memo, useDeferredValue, useMemo } from 'react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import 'katex/dist/katex.min.css';
import remarkGfm from 'remark-gfm';
import { normalizeMath } from '@shared/utils/mathMarkup';
import { MarkdownTable } from './MarkdownTable';
import { MarkdownLink } from './MarkdownLink';
import { mermaidTheme } from './mermaidTheme';
import { MARKDOWN_ICONS } from './markdownIcons';
import { useThemeContext } from '@shared/contexts/ThemeContext';

interface MarkdownProps {
  content: string;
  streaming?: boolean;
  messageId?: string;
  /** `aside`: content beside the answer (the model's thinking) — muted, smaller and tight. */
  variant?: 'answer' | 'aside';
}

// Stable module-level plugin refs so Streamdown does not remount CodeBlocks on every streaming render.
const REMARK_PLUGINS = [remarkGfm];
/** Code blocks, math (KaTeX) in `$$…$$` (normalizeMath turns the other ways models write math into it), and Mermaid
 *  diagrams in ```mermaid blocks. */
const STREAMDOWN_PLUGINS = { code, math: createMathPlugin({ errorColor: 'var(--text-muted)' }), mermaid };
const REHYPE_PLUGINS = [defaultRehypePlugins.harden];
/** Tables render through the kit (Streamdown's own table chrome isn't themeable here); links open through the app's opener. */
const COMPONENTS = { table: MarkdownTable, a: MarkdownLink };
/** No Streamdown link dialog: a link opens in the browser, as in native apps. */
const LINK_SAFETY = { enabled: false };

const MarkdownInner: React.FC<MarkdownProps> = ({
  content,
  streaming,
  variant = 'answer',
}) => {
  // Diagrams in the app's colours, read again when light or dark changes.
  const { isDark } = useThemeContext();
  const diagrams = useMemo(() => mermaidTheme(), [isDark]);

  // While streaming, render the deferred value so token bursts coalesce into one re-parse.
  const deferredContent = useDeferredValue(content);
  const effectiveContent = normalizeMath(streaming ? deferredContent : content);

  if (!content) return null;

  return (
    <div className="markdown-content" data-variant={variant}>
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        parseIncompleteMarkdown={streaming}
        animated={streaming ? false : { animation: 'fadeIn', duration: 500 }}
        className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
        plugins={STREAMDOWN_PLUGINS}
        mermaid={diagrams}
        linkSafety={LINK_SAFETY}
        icons={MARKDOWN_ICONS}
      >
        {effectiveContent}
      </Streamdown>
    </div>
  );
};

export const Markdown = memo(
  MarkdownInner,
  (prev, next) =>
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.variant === next.variant
);
