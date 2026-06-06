import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from '@shared/components/CodeBlock';
import { bufferPartialMarkdown } from '@shared/utils/markdownBuffer';

interface CleanMarkdownProps {
  content: string;
  className?: string;
  streaming?: boolean;
}

/**
 * CleanMarkdown Component
 *
 * Renders full markdown with syntax highlighting using react-markdown.
 * Supports streaming mode to prevent flickering with partial syntax.
 * Supports:
 * - Code blocks with syntax highlighting and language labels
 * - Tables, strikethrough, task lists (GFM)
 * - Headings, lists, blockquotes
 * - Links, bold, italic, inline code
 * - Light/Dark mode themes
 */
const CleanMarkdown: React.FC<CleanMarkdownProps> = ({ content, className, streaming = false }) => {
  if (!content) return null;

  // Buffer partial markdown syntax during streaming to prevent flicker
  const safeContent = streaming ? bufferPartialMarkdown(content) : content;

  return (
    <div
      className={`markdown-content leading-relaxed ${
        className || 'text-[15px] text-zinc-700 dark:text-zinc-200'
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2 text-zinc-900 dark:text-zinc-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-3 mb-2 text-zinc-900 dark:text-zinc-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-3 mb-1.5 text-zinc-900 dark:text-zinc-100">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-2 mb-1 text-zinc-800 dark:text-zinc-200">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="my-2 leading-relaxed text-zinc-700 dark:text-zinc-200">
              {children}
            </p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="my-3 ml-6 space-y-2 list-disc text-zinc-700 dark:text-zinc-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-6 space-y-2 list-decimal text-zinc-700 dark:text-zinc-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-zinc-700 dark:text-zinc-200 leading-relaxed pl-2">
              {children}
            </li>
          ),

          // Code blocks and inline code
          pre: ({ children }) => {
            // Extract code element and its props
            return <>{children}</>;
          },
          code: ({ inline, className, children, ...props }: any) => {
            // Check if this is truly inline code:
            // - Has inline prop set to true, OR
            // - No className (no language specified), OR
            // - No newlines in content (single line)
            const content = String(children).replace(/\n$/, '');
            const isInlineCode = inline || !className || !content.includes('\n');

            // For inline code
            if (isInlineCode) {
              return (
                <CodeBlock inline={true} className={className}>
                  {content}
                </CodeBlock>
              );
            }

            // For block code - rehype-highlight adds syntax classes to children
            // Pass children directly to preserve highlighting
            return (
              <CodeBlock inline={false} className={className}>
                {children}
              </CodeBlock>
            );
          },

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 border-l-4 border-zinc-300 dark:border-zinc-700 italic text-zinc-600 dark:text-zinc-400">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="min-w-full border border-zinc-300 dark:border-zinc-700 rounded-lg">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr>{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="my-4 border-t border-zinc-300 dark:border-zinc-700" />
          ),

          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-bold text-zinc-900 dark:text-zinc-100">
              {children}
            </strong>
          ),

          // Emphasis/Italic
          em: ({ children }) => (
            <em className="italic text-zinc-700 dark:text-zinc-200">
              {children}
            </em>
          ),
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
};

export default CleanMarkdown;
