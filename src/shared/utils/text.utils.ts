/** Text prep for LLM context; all LLM truncation goes through here, never inline slice(). */

/** Cut near `maxChars` at a sentence end, else a newline, else hard, and append a trimmed notice for the LLM. */
export function truncateForLLM(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;

  // Look for the last sentence boundary within the window
  const window = text.slice(0, maxChars);

  // Try sentence-ending punctuation followed by whitespace
  const sentenceEnd = window.search(/[.!?][\s\n][^.!?]*$/);
  if (sentenceEnd > maxChars * 0.6) {
    const cut = sentenceEnd + 1; // include the punctuation
    const omitted = text.length - cut;
    return text.slice(0, cut) + `\n\n[Truncated — ${omitted.toLocaleString()} chars omitted]`;
  }

  // Try last newline
  const lastNewline = window.lastIndexOf('\n');
  if (lastNewline > maxChars * 0.6) {
    const omitted = text.length - lastNewline;
    return text.slice(0, lastNewline) + `\n\n[Truncated — ${omitted.toLocaleString()} chars omitted]`;
  }

  // Hard cut at maxChars
  const omitted = text.length - maxChars;
  return window + `\n\n[Truncated — ${omitted.toLocaleString()} chars omitted]`;
}
