/**
 * MarkdownCodeBlock Component
 *
 * Custom `pre` component for Streamdown that wraps code blocks with
 * a language header (icon + label) and copy button.
 * Passed via Streamdown's `components={{ pre: MarkdownCodeBlock }}`.
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import {
  SiJavascript,
  SiTypescript,
  SiPython,
  SiCplusplus,
  SiGo,
  SiRust,
  SiRuby,
  SiPhp,
  SiSwift,
  SiHtml5,
  SiCss,
  SiJson,
  SiGnubash,
  SiMysql,
  SiGraphql,
  SiDocker,
  SiReact,
} from '@icons-pack/react-simple-icons';

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

const LANG_META: Record<string, { label: string; icon?: IconComponent; color: string }> = {
  javascript: { label: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  js: { label: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  typescript: { label: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  ts: { label: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  tsx: { label: 'TSX', icon: SiReact, color: '#61DAFB' },
  jsx: { label: 'JSX', icon: SiReact, color: '#61DAFB' },
  python: { label: 'Python', icon: SiPython, color: '#3776AB' },
  py: { label: 'Python', icon: SiPython, color: '#3776AB' },
  java: { label: 'Java', color: '#007396' },
  cpp: { label: 'C++', icon: SiCplusplus, color: '#00599C' },
  c: { label: 'C', color: '#A8B9CC' },
  go: { label: 'Go', icon: SiGo, color: '#00ADD8' },
  rust: { label: 'Rust', icon: SiRust, color: '#000000' },
  rs: { label: 'Rust', icon: SiRust, color: '#000000' },
  ruby: { label: 'Ruby', icon: SiRuby, color: '#CC342D' },
  rb: { label: 'Ruby', icon: SiRuby, color: '#CC342D' },
  php: { label: 'PHP', icon: SiPhp, color: '#777BB4' },
  swift: { label: 'Swift', icon: SiSwift, color: '#FA7343' },
  html: { label: 'HTML', icon: SiHtml5, color: '#E34F26' },
  css: { label: 'CSS', icon: SiCss, color: '#1572B6' },
  json: { label: 'JSON', icon: SiJson, color: '#000000' },
  bash: { label: 'Bash', icon: SiGnubash, color: '#4EAA25' },
  shell: { label: 'Shell', icon: SiGnubash, color: '#4EAA25' },
  sh: { label: 'Shell', icon: SiGnubash, color: '#4EAA25' },
  sql: { label: 'SQL', icon: SiMysql, color: '#4479A1' },
  graphql: { label: 'GraphQL', icon: SiGraphql, color: '#E10098' },
  dockerfile: { label: 'Dockerfile', icon: SiDocker, color: '#2496ED' },
  xml: { label: 'XML', color: '#005FAD' },
  yaml: { label: 'YAML', color: '#CB171E' },
  yml: { label: 'YAML', color: '#CB171E' },
  markdown: { label: 'Markdown', color: '#000000' },
  md: { label: 'Markdown', color: '#000000' },
};

/** Extract plain text from React children tree */
function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.props.children) {
    return extractText(node.props.children);
  }
  return '';
}

/** Detect language from className or data attributes on child code elements */
interface LanguageProps {
  children?: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

function detectLanguage(props: LanguageProps): string | null {
  // Check data-language on pre itself (Shiki pattern)
  const dataLanguage = props['data-language'];
  if (typeof dataLanguage === 'string') return dataLanguage;

  // Check children for code element with language class
  const children = React.Children.toArray(props.children);
  for (const child of children) {
    if (React.isValidElement<LanguageProps>(child)) {
      const childDataLanguage = child.props['data-language'];
      if (typeof childDataLanguage === 'string') return childDataLanguage;
      if (typeof child.props.className === 'string') {
        const match = child.props.className.match(/language-(\w+)/);
        if (match) return match[1].toLowerCase();
      }
    }
  }
  return null;
}

export const MarkdownCodeBlock: React.FC<LanguageProps> = (props) => {
  const [copied, setCopied] = useState(false);
  const language = detectLanguage(props);
  const meta = language ? LANG_META[language] : null;
  const Icon = meta?.icon;
  const codeText = extractText(props.children);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className={`my-3 rounded-lg overflow-hidden border ${BORDER.strong}`}>
      {/* Language Header */}
      <div className={`flex items-center justify-between px-3 py-1.5 ${SURFACE.selectedCard} border-b ${BORDER.strong}`}>
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} color={meta!.color} />}
          <span className={`text-[11px] font-semibold ${TEXT.secondary} uppercase tracking-wide`}>
            {meta?.label || language || 'Code'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium ${TEXT.muted} hover:text-paper-900 dark:hover:text-night-200 ${COMPONENT.menuButtonHover} rounded transition-colors`}
          title="Copy code"
        >
          {copied ? (
            <><Check className="w-3 h-3" /><span>Copied</span></>
          ) : (
            <><Copy className="w-3 h-3" /><span>Copy</span></>
          )}
        </button>
      </div>

      {/* Code Content — render original pre with Shiki output */}
      <pre {...props} className={`${props.className || ''} !m-0 !rounded-none !border-0 p-4 overflow-x-auto ${SURFACE.card}`}>
        {props.children}
      </pre>
    </div>
  );
};
