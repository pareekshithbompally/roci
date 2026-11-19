/** Search's one matching rule: every word typed appears somewhere in the text, in any order, ignoring case. */

/** The words typed, lower-cased, blanks dropped. */
export const queryWords = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

export function matchesAllWords(text: string, query: string): boolean {
  const words = queryWords(query);
  const haystack = text.toLowerCase();
  return words.length > 0 && words.every((word) => haystack.includes(word));
}
