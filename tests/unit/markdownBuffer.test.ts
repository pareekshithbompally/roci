/**
 * Markdown Buffer Tests
 * 
 * Tests the markdown buffering utility that prevents flickering during streaming.
 */

import { describe, it, expect } from 'vitest';
import { bufferPartialMarkdown, isMarkdownSafe } from '@shared/utils/markdownBuffer';

describe('markdownBuffer', () => {
  describe('bufferPartialMarkdown', () => {
    describe('empty and basic input', () => {
      it('should handle empty string', () => {
        expect(bufferPartialMarkdown('')).toBe('');
      });

      it('should return plain text unchanged', () => {
        expect(bufferPartialMarkdown('Hello world')).toBe('Hello world');
      });

      it('should handle multi-line plain text', () => {
        const text = 'Line 1\nLine 2\nLine 3';
        expect(bufferPartialMarkdown(text)).toBe(text);
      });
    });

    describe('code blocks', () => {
      it('should buffer incomplete code block (no closing)', () => {
        const partial = '```python\nprint("hel';
        const result = bufferPartialMarkdown(partial);
        // Should buffer - incomplete code block
        expect(result).not.toContain('print');
      });

      it('should render complete code block', () => {
        const complete = '```python\nprint("hello")\n```';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should handle code block with language', () => {
        const complete = '```typescript\nconst x = 1;\n```';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should handle code block without language', () => {
        const complete = '```\nsome code\n```';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should handle multiple complete code blocks', () => {
        const text = '```js\ncode1\n```\ntext\n```py\ncode2\n```';
        expect(bufferPartialMarkdown(text)).toBe(text);
      });

      it('should buffer text after incomplete second code block', () => {
        const text = '```js\ncode1\n```\ntext\n```py\ncode2';
        const result = bufferPartialMarkdown(text);
        // First code block should be complete, second should be buffered
        expect(result).toContain('```js\ncode1\n```');
      });
    });

    describe('bold markers', () => {
      it('should buffer incomplete bold (opening only)', () => {
        const partial = 'Hello **world';
        const result = bufferPartialMarkdown(partial);
        // Should remove trailing incomplete **
        expect(result).not.toContain('**world');
        expect(result).toContain('Hello');
      });

      it('should render complete bold', () => {
        const complete = 'Hello **world**';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should handle multiple complete bold sections', () => {
        const text = '**bold1** normal **bold2**';
        expect(bufferPartialMarkdown(text)).toBe(text);
      });
    });

    describe('italic markers', () => {
      it('should buffer incomplete italic with *', () => {
        const partial = 'Hello *world';
        const result = bufferPartialMarkdown(partial);
        expect(result).not.toContain('*world');
      });

      it('should render complete italic with *', () => {
        const complete = 'Hello *world*';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should buffer incomplete italic with _', () => {
        const partial = 'Hello _world';
        const result = bufferPartialMarkdown(partial);
        expect(result).not.toContain('_world');
      });

      it('should render complete italic with _', () => {
        const complete = 'Hello _world_';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });
    });

    describe('mixed content', () => {
      it('should handle complete markdown with all elements', () => {
        const complete = '# Heading\n\n**Bold** and *italic* text.\n\n```js\ncode\n```';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });

      it('should buffer trailing incomplete marker in mixed content', () => {
        const partial = '# Heading\n\nSome **bold** and now **incomplete';
        const result = bufferPartialMarkdown(partial);
        expect(result).toContain('# Heading');
        expect(result).toContain('**bold**');
        expect(result).not.toContain('**incomplete');
      });

      it('should handle longer text with incomplete marker at end', () => {
        // Text longer than 2x buffer size but with incomplete marker
        const longText = 'A'.repeat(50) + ' normal text ' + 'B'.repeat(50) + ' **partial';
        const result = bufferPartialMarkdown(longText);
        expect(result).not.toContain('**partial');
      });
    });

    describe('edge cases', () => {
      it('should handle consecutive asterisks with even count', () => {
        // Even number of * treated as complete pairs
        const text = 'Rating: ****';
        expect(bufferPartialMarkdown(text)).toBe(text);
      });

      it('should handle inline code with backticks', () => {
        const complete = 'Use `const x = 1` for declaration';
        expect(bufferPartialMarkdown(complete)).toBe(complete);
      });
    });
  });

  describe('isMarkdownSafe', () => {
    it('should return true for plain text', () => {
      expect(isMarkdownSafe('Hello world')).toBe(true);
    });

    it('should return true for complete markdown', () => {
      expect(isMarkdownSafe('**bold** and *italic*')).toBe(true);
    });

    it('should return true for complete code block', () => {
      expect(isMarkdownSafe('```js\ncode\n```')).toBe(true);
    });

    it('should return false for incomplete code block', () => {
      expect(isMarkdownSafe('```js\ncode')).toBe(false);
    });

    it('should return false for incomplete bold', () => {
      expect(isMarkdownSafe('Hello **world')).toBe(false);
    });

    it('should return false for incomplete italic', () => {
      expect(isMarkdownSafe('Hello *world')).toBe(false);
    });

    it('should return false for incomplete underscore italic', () => {
      expect(isMarkdownSafe('Hello _world')).toBe(false);
    });
  });
});
