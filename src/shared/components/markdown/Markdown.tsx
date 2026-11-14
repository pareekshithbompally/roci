/**
 * Markdown — the app's single markdown renderer (chat messages and meeting summaries).
 *
 * Streamdown for both streaming and static content. This ensures consistent
 * styling with zero visual shift when streaming finishes.
 *
 * Styling is defined in src/styles/markdown.css via the .markdown-content class.
 *
 * When webCitations are provided, a rehype plugin transforms {{cite:N}} tokens
 * in the text into <InlineCitationMarker> React components via the components prop.
 */

import React, { memo, useMemo, useDeferredValue } from 'react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import remarkGfm from 'remark-gfm';
import { rehypeCitationMarkers } from '@shared/utils/inlineCitationInjector';
import { InlineCitationMarker } from './InlineCitationMarker';
import type { WebCitation } from '@shared/types';

interface MarkdownProps {
  content: string;
  streaming?: boolean;
  messageId?: string;
  /** When provided, enables inline citation marker rendering */
  webCitations?: WebCitation[];
}

// Module-level stable references — prevents Streamdown from re-creating its
// plugin context and re-mounting CodeBlock components on every streaming render.
const REMARK_PLUGINS = [remarkGfm];
const STREAMDOWN_PLUGINS = { code };
const REHYPE_PLUGINS_DEFAULT = [defaultRehypePlugins.harden];
const REHYPE_PLUGINS_CITATIONS = [defaultRehypePlugins.harden, rehypeCitationMarkers];

const MarkdownInner: React.FC<MarkdownProps> = ({
  content,
  streaming,
  webCitations,
}) => {
  // While streaming, render the deferred (previous) value so rapid token
  // arrivals don't force a full markdown re-parse every frame — React
  // coalesces the deferred updates and only re-parses once it catches up.
  const deferredContent = useDeferredValue(content);
  const effectiveContent = streaming ? deferredContent : content;

  if (!content) return null;

  const hasCitations = !!(webCitations && webCitations.length > 0);

  const rehypePlugins = hasCitations ? REHYPE_PLUGINS_CITATIONS : REHYPE_PLUGINS_DEFAULT;

  const components = useMemo(() => {
    if (!hasCitations) return undefined;
    return {
      span: (props: Record<string, unknown>) => {
        const dataCite = props.dataCite as string | undefined;
        if (dataCite) {
          const sourceIndices = dataCite.split(',').map(Number);
          return <InlineCitationMarker sourceIndices={sourceIndices} webCitations={webCitations!} />;
        }
        // Default span rendering
        const { node, ...rest } = props;
        return <span {...rest as React.HTMLAttributes<HTMLSpanElement>} />;
      },
    };
  }, [hasCitations, webCitations]);

  return (
    <div className="markdown-content">
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        parseIncompleteMarkdown={streaming}
        animated={streaming ? false : { animation: 'fadeIn', duration: 500 }}
        className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        components={components}
        plugins={STREAMDOWN_PLUGINS}
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
    prev.webCitations === next.webCitations
);
