import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from '@shared/components/markdown/Markdown';
import { normalizeMath } from '@shared/utils/mathMarkup';
import { ThemeProvider } from '@shared/contexts/ThemeContext';

/** Markdown renders inside the app's ThemeProvider (diagrams take its light/dark). */
const katexCount = (content: string) =>
  render(<ThemeProvider><Markdown content={content} /></ThemeProvider>).container.querySelectorAll('.katex').length;

describe('markdown math', () => {
  it('renders $$…$$, $…$, \\(…\\) and \\[…\\] with KaTeX', () => {
    expect(katexCount('$$F(\\omega) = \\int f(t)\\,dt$$')).toBe(1);
    expect(katexCount('Inline $e^{i\\pi}$ and $N$ and $x_{N-1}$ here.')).toBe(3);
    expect(katexCount('Paren \\(a^2+b^2\\) here.\n\n\\[c^2\\]')).toBe(2);
  });

  it('leaves money and code alone', () => {
    expect(normalizeMath('It costs $5 and $10.')).toBe('It costs $5 and $10.');
    expect(normalizeMath('Price $5, total $10 today; budget $1.2M')).toBe('Price $5, total $10 today; budget $1.2M');
    expect(normalizeMath('Run `echo $HOME and $PATH` then:\n```\nx = $a$\n```')).toBe('Run `echo $HOME and $PATH` then:\n```\nx = $a$\n```');
    expect(katexCount('It costs $5 and $10.')).toBe(0);
  });

  it('follows Pandoc: $2x+1$ is math, money and escapes stay text, unfinished fences and spans are code', () => {
    expect(normalizeMath('Solve $2x+1$ now')).toBe('Solve $$2x+1$$ now');
    expect(normalizeMath('Escaped \\$5 stays')).toBe('Escaped \\$5 stays');
    expect(normalizeMath('Paid $1,200, then $3,400.')).toBe('Paid $1,200, then $3,400.');
    expect(normalizeMath('```js\nconst a = $b$;')).toBe('```js\nconst a = $b$;');
    expect(normalizeMath('Use ``a `$x$` b`` here')).toBe('Use ``a `$x$` b`` here');
    expect(normalizeMath('Index array\\[0\\] stays')).toBe('Index array\\[0\\] stays');
    expect(normalizeMath('- item\n  \\[x^2\\]')).toBe('- item\n  $$\n  x^2\n  $$');
  });
});

