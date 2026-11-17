/** Normalizes the ways models write math to the `$$…$$` the renderer reads, leaving money alone: `$…$` is math only when
 *  the opening `$` isn't followed by a digit or space and the closing one isn't preceded by a space ($5 and $10 stays
 *  text); `\(…\)` and `\[…\]` are math too. Code (fenced and inline) is never touched. */

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const INLINE_DOLLAR = /(?<![\\$\w])\$(?![\s\d$])([^$\n]+?)(?<![\s\\])\$(?![\d$])/g;
const INLINE_PAREN = /\\\(([\s\S]+?)\\\)/g;
const DISPLAY_BRACKET = /\\\[([\s\S]+?)\\\]/g;

const math = (body: string) => `$$${body}$$`;

function normalizeProse(text: string): string {
  return text
    .replace(DISPLAY_BRACKET, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(INLINE_PAREN, (_, body: string) => math(body))
    .replace(INLINE_DOLLAR, (_, body: string) => math(body));
}

export function normalizeMath(markdown: string): string {
  if (!markdown.includes('$') && !markdown.includes('\\(') && !markdown.includes('\\[')) return markdown;
  return markdown
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : normalizeProse(part)))
    .join('');
}
