/**
 * Extracts the `response` field's string value from a streaming JSON object.
 *
 * Designed for schemas like:
 *   { "response": "markdown text...", "suggestions": [...], "title": "..." }
 *
 * The extractor is a lightweight state machine:
 * - WAITING: scanning for `"response"` followed by `:` and `"`  (whitespace-tolerant)
 * - EXTRACTING: outputting characters from the response value, handling JSON escapes
 * - DONE: hit the closing `"` of the response value
 *
 * The full JSON is accumulated separately for parsing on completion.
 */
export class JsonStreamExtractor {
  private state: 'waiting' | 'extracting' | 'done' = 'waiting';
  private buffer = '';
  private fullJson = '';
  private escapeNext = false;
  private unicodeBuffer = '';
  private unicodeRemaining = 0;

  /**
   * Feed a chunk from the adapter.
   * Returns the displayable text extracted from the `response` field.
   * Returns empty string if no displayable text in this chunk (e.g., still in JSON preamble).
   */
  push(chunk: string): string {
    this.fullJson += chunk;

    if (this.state === 'done') return '';

    let displayText = '';
    this.buffer += chunk;

    if (this.state === 'waiting') {
      // Whitespace-tolerant: matches "response":"  and  "response" : "  etc.
      const match = this.buffer.match(/"response"\s*:\s*"/);
      if (!match || match.index === undefined) return '';

      // Found the start — switch to extracting, process remainder
      this.state = 'extracting';
      this.buffer = this.buffer.slice(match.index + match[0].length);
    }

    if (this.state === 'extracting') {
      for (let i = 0; i < this.buffer.length; i++) {
        const ch = this.buffer[i];

        // Handle unicode escape accumulation (\uXXXX)
        if (this.unicodeRemaining > 0) {
          this.unicodeBuffer += ch;
          this.unicodeRemaining--;
          if (this.unicodeRemaining === 0) {
            displayText += String.fromCharCode(parseInt(this.unicodeBuffer, 16));
            this.unicodeBuffer = '';
          }
          continue;
        }

        if (this.escapeNext) {
          this.escapeNext = false;
          if (ch === 'u') {
            // Start unicode sequence — need 4 more chars
            this.unicodeRemaining = 4;
            this.unicodeBuffer = '';
          } else {
            displayText += this.unescapeChar(ch);
          }
          continue;
        }

        if (ch === '\\') {
          this.escapeNext = true;
          continue;
        }

        if (ch === '"') {
          // End of response value
          this.state = 'done';
          this.buffer = '';
          return displayText;
        }

        displayText += ch;
      }
      this.buffer = '';
    }

    return displayText;
  }

  private unescapeChar(ch: string): string {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      default: return '\\' + ch;
    }
  }

  /** Get the full accumulated JSON string (for parsing on completion) */
  getFullJson(): string {
    return this.fullJson;
  }

  /** Whether the response field has been fully extracted */
  isDone(): boolean {
    return this.state === 'done';
  }
}
