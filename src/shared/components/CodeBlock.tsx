/**
 * CodeBlock Component
 * 
 * Renders syntax-highlighted code blocks with language indicator, icon, and copy button.
 * Supports light/dark mode themes.
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import {
  SiJavascript,
  SiTypescript,
  SiPython,
  SiCplusplus,
  SiC,
  SiSharp,
  SiGo,
  SiRust,
  SiRuby,
  SiPhp,
  SiSwift,
  SiKotlin,
  SiScala,
  SiHtml5,
  SiCss,
  SiSass,
  SiJson,
  SiYaml,
  SiMarkdown,
  SiGnubash,
  SiMysql,
  SiGraphql,
  SiDocker,
  SiReact,
  SiVuedotjs,
  SiSvelte,
} from '@icons-pack/react-simple-icons';

interface CodeBlockProps {
  /** Code content */
  children: string | React.ReactNode;
  /** Language identifier (from className like "language-python") */
  className?: string;
  /** Inline code vs block */
  inline?: boolean;
}

/**
 * Language metadata with brand colors
 */
const languageConfig: Record<string, { label: string; icon?: React.ComponentType<any>; color: string }> = {
  javascript: { label: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  js: { label: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  typescript: { label: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  ts: { label: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  python: { label: 'Python', icon: SiPython, color: '#3776AB' },
  py: { label: 'Python', icon: SiPython, color: '#3776AB' },
  java: { label: 'Java', color: '#007396' },
  cpp: { label: 'C++', icon: SiCplusplus, color: '#00599C' },
  c: { label: 'C', icon: SiC, color: '#A8B9CC' },
  csharp: { label: 'C#', icon: SiSharp, color: '#239120' },
  cs: { label: 'C#', icon: SiSharp, color: '#239120' },
  go: { label: 'Go', icon: SiGo, color: '#00ADD8' },
  rust: { label: 'Rust', icon: SiRust, color: '#000000' },
  rs: { label: 'Rust', icon: SiRust, color: '#000000' },
  ruby: { label: 'Ruby', icon: SiRuby, color: '#CC342D' },
  rb: { label: 'Ruby', icon: SiRuby, color: '#CC342D' },
  php: { label: 'PHP', icon: SiPhp, color: '#777BB4' },
  swift: { label: 'Swift', icon: SiSwift, color: '#FA7343' },
  kotlin: { label: 'Kotlin', icon: SiKotlin, color: '#7F52FF' },
  scala: { label: 'Scala', icon: SiScala, color: '#DC322F' },
  html: { label: 'HTML', icon: SiHtml5, color: '#E34F26' },
  css: { label: 'CSS', icon: SiCss, color: '#1572B6' },
  scss: { label: 'SCSS', icon: SiSass, color: '#CC6699' },
  sass: { label: 'Sass', icon: SiSass, color: '#CC6699' },
  json: { label: 'JSON', icon: SiJson, color: '#000000' },
  yaml: { label: 'YAML', icon: SiYaml, color: '#CB171E' },
  yml: { label: 'YAML', icon: SiYaml, color: '#CB171E' },
  markdown: { label: 'Markdown', icon: SiMarkdown, color: '#000000' },
  md: { label: 'Markdown', icon: SiMarkdown, color: '#000000' },
  bash: { label: 'Bash', icon: SiGnubash, color: '#4EAA25' },
  shell: { label: 'Shell', icon: SiGnubash, color: '#4EAA25' },
  sh: { label: 'Shell', icon: SiGnubash, color: '#4EAA25' },
  sql: { label: 'SQL', icon: SiMysql, color: '#4479A1' },
  graphql: { label: 'GraphQL', icon: SiGraphql, color: '#E10098' },
  dockerfile: { label: 'Dockerfile', icon: SiDocker, color: '#2496ED' },
  xml: { label: 'XML', color: '#005FAD' },
  jsx: { label: 'JSX', icon: SiReact, color: '#61DAFB' },
  tsx: { label: 'TSX', icon: SiReact, color: '#61DAFB' },
  vue: { label: 'Vue', icon: SiVuedotjs, color: '#4FC08D' },
  svelte: { label: 'Svelte', icon: SiSvelte, color: '#FF3E00' },
  text: { label: 'Plain Text', color: '#666666' },
  plaintext: { label: 'Plain Text', color: '#666666' },
};

/**
 * Extract language from className (e.g., "language-python" -> "python")
 */
const extractLanguage = (className?: string): string | null => {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  return match ? match[1].toLowerCase() : null;
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ children, className, inline }) => {
  const [copied, setCopied] = useState(false);

  // Inline code - simple styling
  if (inline) {
    return (
      <code className={`${SURFACE.chip} ${TEXT.primary} px-1.5 py-0.5 rounded text-sm font-mono`}>
        {children}
      </code>
    );
  }

  // Extract text content for copying
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.props.children) {
      return getTextContent(node.props.children);
    }
    return '';
  };

  const codeText = getTextContent(children);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[CodeBlock] Failed to copy:', error);
    }
  };

  // Block code - with language header and copy button
  const language = extractLanguage(className);
  const config = language ? languageConfig[language] : null;
  const Icon = config?.icon;

  return (
    <div className={`my-3 rounded-lg overflow-hidden border ${BORDER.strong} relative group`}>
      {/* Language Header */}
      <div className={`flex items-center justify-between px-4 py-2 ${SURFACE.selectedCard} border-b ${BORDER.strong}`}>
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon 
              size={16}
              color={config.color}
            />
          )}
          {config && (
            <span className={`text-xs font-semibold ${TEXT.secondary} uppercase tracking-wide`}>
              {config.label}
            </span>
          )}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium ${TEXT.muted} hover:text-paper-900 dark:hover:text-night-100 ${COMPONENT.menuButtonHover} rounded transition-colors`}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content - preserve syntax highlighting classes */}
      <pre className={`p-4 ${SURFACE.card} overflow-x-auto m-0`}>
        <code className={className}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;
