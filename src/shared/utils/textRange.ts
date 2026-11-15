/** Locates spoken text in rendered text, comparing both without whitespace or the markup read-aloud drops. */

/** Characters left out of the comparison: whitespace, and markup text.rs strips (`` ` * _ ~ | ``). */
const IGNORED = /[\s`*_~|]/;

interface Located {
  node: Text;
  offset: number;
}

/** Every compared character under `root`, with where it sits in the DOM. */
function compared(root: Node): { text: string; at: Located[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  const at: Located[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let offset = 0; offset < node.data.length; offset++) {
      const char = node.data[offset];
      if (IGNORED.test(char)) continue;
      text += char;
      at.push({ node, offset });
    }
  }
  return { text, at };
}

/** Range of `needle` in `root` from compared position `from` (repeats found in order); `end` is where to resume. */
export function findTextRange(root: Node, needle: string, from: number): { range: Range; end: number } | null {
  const target = [...needle].filter((char) => !IGNORED.test(char)).join('');
  if (!target) return null;
  const { text, at } = compared(root);
  const start = text.indexOf(target, from);
  if (start < 0) return null;
  const first = at[start];
  const last = at[start + target.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return { range, end: start + target.length };
}
