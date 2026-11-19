/** Search's one matching rule: every word typed appears somewhere in the text, in any order, ignoring case. */
export function matchesAllWords(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = text.toLowerCase();
  return words.length > 0 && words.every((word) => haystack.includes(word));
}
