/**
 * StreamingMarkdown Component
 *
 * Uses Streamdown for ALL markdown rendering —
 * both during streaming and for completed messages. This ensures consistent
 * styling with zero visual shift when streaming finishes.
 *
 * Styling is defined in src/styles/markdown.css via the .markdown-content class.
 * Code blocks use MarkdownCodeBlock for language icons and copy buttons.
 *
 * When webCitations are provided, a rehype plugin transforms {{cite:N}} tokens
 * in the text into <InlineCitationMarker> React components via the components prop.
 */

import React, { memo, useMemo } from 'react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import remarkGfm from 'remark-gfm';
import { rehypeCitationMarkers } from '@shared/utils/inlineCitationInjector';
import { InlineCitationMarker } from './InlineCitationMarker';
import type { WebCitation } from '@/types';

interface StreamingMarkdownProps {
  content: string;
  streaming?: boolean;
  messageId?: string;
  /** When provided, enables inline citation marker rendering */
  webCitations?: WebCitation[];
}

const StreamingMarkdownInner: React.FC<StreamingMarkdownProps> = ({
  content,
  webCitations,
}) => {
  if (!content) return null;

  const hasCitations = !!(webCitations && webCitations.length > 0);

  const rehypePlugins = useMemo(
    () => hasCitations
      ? [defaultRehypePlugins.harden, rehypeCitationMarkers]
      : [defaultRehypePlugins.harden],
    [hasCitations]
  );

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
        animate={true}
        animationDuration={500}
        className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
        plugins={{
          code: code,
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
};

export const StreamingMarkdown = memo(
  StreamingMarkdownInner,
  (prev, next) =>
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.webCitations === next.webCitations
);
