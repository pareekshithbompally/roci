/** Normalizes the ways models write math to the `$$…$$` the renderer reads (KaTeX), with Pandoc's rules so money stays
 *  text: `$…$` opens on a non-space, closes on a non-space not followed by a digit, on one line ($5 and $10 stay text,
 *  $2x+1$ is math); `\(…\)` on one line; `\[…\]` when it starts a line. Code (fenced, still-open fences, inline spans
 *  of any backtick length) is never touched. */

const INLINE_DOLLAR = /(?<![\\$])\$(?=[^\s$])((?:\\.|[^$\\\n])+?)(?<=[^\s\\])\$(?![\d$])/g;
const INLINE_PAREN = /\\\((.+?)\\\)/g;
const INLINE_CODE = /(`+)(?:(?!\1)[^\n])+?\1/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DISPLAY_OPEN = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)\\\[(.*)$/;

const math = (body: string) => `$$${body}$$`;

/** One prose line, its inline code spans kept as they are. */
function inlineMath(line: string): string {
  let out = '';
  let last = 0;
  for (const code of line.matchAll(INLINE_CODE)) {
    out += line.slice(last, code.index).replace(INLINE_PAREN, (_, b: string) => math(b)).replace(INLINE_DOLLAR, (_, b: string) => math(b));
    out += code[0];
    last = code.index + code[0].length;
  }
  return out + line.slice(last).replace(INLINE_PAREN, (_, b: string) => math(b)).replace(INLINE_DOLLAR, (_, b: string) => math(b));
}

/** `\[` that starts a line (after its indent or list marker) to the `\]` that ends one: a `$$` display block. */
function displayBlock(lines: string[], start: number): { out: string[]; next: number } | null {
  const open = DISPLAY_OPEN.exec(lines[start]);
  if (!open) return null;
  const [, lead, first] = open;
  const indent = ' '.repeat(lead.length);
  for (let i = start; i < lines.length; i++) {
    const text = i === start ? first : lines[i];
    const close = text.lastIndexOf('\\]');
    if (close === -1) continue;
    const body = [...(i === start ? [] : [first]), ...lines.slice(start + 1, i), text.slice(0, close)].join('\n').trim();
    return { out: [`${lead}$$`, `${indent}${body}`, `${indent}$$`], next: i + 1 };
  }
  return null; // still streaming: left as written until it closes
}

export function normalizeMath(markdown: string): string {
  if (!markdown.includes('$') && !markdown.includes('\\(') && !markdown.includes('\\[')) return markdown;
  const lines = markdown.split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (marker) {
      fence = marker; // runs to its close, or to the end while a reply streams
      out.push(line);
      continue;
    }
    const display = displayBlock(lines, i);
    if (display) {
      out.push(...display.out);
      i = display.next - 1;
      continue;
    }
    out.push(inlineMath(line));
  }
  return out.join('\n');
}
