import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from '@shared/components/markdown/Markdown';
import { normalizeMath } from '@shared/utils/mathMarkup';

const katexCount = (content: string) => render(<Markdown content={content} />).container.querySelectorAll('.katex').length;

describe('markdown math', () => {
  it('renders $$…$$, $…$, \\(…\\) and \\[…\\] with KaTeX', () => {
    expect(katexCount('$$F(\\omega) = \\int f(t)\\,dt$$')).toBe(1);
    expect(katexCount('Inline $e^{i\\pi}$ and $N$ and $x_{N-1}$ here.')).toBe(3);
    expect(katexCount('Paren \\(a^2+b^2\\) and \\[c^2\\]')).toBe(2);
  });

  it('leaves money and code alone', () => {
    expect(normalizeMath('It costs $5 and $10.')).toBe('It costs $5 and $10.');
    expect(normalizeMath('Price $5, total $10 today; budget $1.2M')).toBe('Price $5, total $10 today; budget $1.2M');
    expect(normalizeMath('Run `echo $HOME and $PATH` then ```\nx = $a$\n```')).toBe('Run `echo $HOME and $PATH` then ```\nx = $a$\n```');
    expect(katexCount('It costs $5 and $10.')).toBe(0);
  });
});
