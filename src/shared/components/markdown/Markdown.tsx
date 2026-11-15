/** The single markdown renderer: Streamdown for streaming and static content, so finishing never shifts layout. */

import React, { memo, useMemo, useDeferredValue } from 'react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import remarkGfm from 'remark-gfm';
import { rehypeCitationMarkers } from '@shared/utils/inlineCitationInjector';
import { InlineCitationMarker } from './InlineCitationMarker';
import { MarkdownTable } from './MarkdownTable';
import type { WebCitation } from '@shared/types';

interface MarkdownProps {
  content: string;
  streaming?: boolean;
  messageId?: string;
  /** When provided, enables inline citation marker rendering */
  webCitations?: WebCitation[];
  /** `aside`: content beside the answer (the model's thinking) — muted, smaller and tight. */
  variant?: 'answer' | 'aside';
}

// Stable module-level plugin refs so Streamdown does not remount CodeBlocks on every streaming render.
const REMARK_PLUGINS = [remarkGfm];
const STREAMDOWN_PLUGINS = { code };
const REHYPE_PLUGINS_DEFAULT = [defaultRehypePlugins.harden];
const REHYPE_PLUGINS_CITATIONS = [defaultRehypePlugins.harden, rehypeCitationMarkers];
/** Tables render through the kit (Streamdown's own table chrome isn't themeable here). */
const BASE_COMPONENTS = { table: MarkdownTable };

const MarkdownInner: React.FC<MarkdownProps> = ({
  content,
  streaming,
  webCitations,
  variant = 'answer',
}) => {
  // While streaming, render the deferred value so token bursts coalesce into one re-parse.
  const deferredContent = useDeferredValue(content);
  const effectiveContent = streaming ? deferredContent : content;

  if (!content) return null;

  const hasCitations = !!(webCitations && webCitations.length > 0);

  const rehypePlugins = hasCitations ? REHYPE_PLUGINS_CITATIONS : REHYPE_PLUGINS_DEFAULT;

  const components = useMemo(() => {
    if (!hasCitations) return BASE_COMPONENTS;
    return {
      ...BASE_COMPONENTS,
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
    <div className="markdown-content" data-variant={variant}>
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
    prev.webCitations === next.webCitations &&
    prev.variant === next.variant
);
