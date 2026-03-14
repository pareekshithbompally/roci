# Phase 3 — Streaming Pipeline Changes

## Objective

Handle the streaming JSON extraction problem. When structured output is enabled, the model streams JSON character by character. The user must see only the `response` field's text content, appearing progressively — not raw JSON. The extraction logic lives in the **callback chain**, not in the streaming store. The store stays dumb.

## The Problem

### Current Flow (Plain Text)

```
Adapter onChunk("Here is my answer...")
    ↓
handleChunk() in ChatContext
    ↓
streamingStore.push("Here is my answer...")
    ↓
StreamingContent renders → user sees text
```

### New Flow (Structured JSON)

Adapter sends:
```
'{"res' → 'ponse":"' → 'Here ' → 'is my ' → 'answer' → '...","su' → 'ggestions":["..."]}'
```

We need to intercept this before the store sees it and extract only the displayable text.

## Architecture: Extractor in the Callback Chain

### Where the Extractor Lives

```
Adapter onChunk(jsonChunk)
    ↓
handleChunk() in ChatContext
    ↓
JsonStreamExtractor.push(jsonChunk) → returns displayText
    ↓                                  (also accumulates fullJson internally)
streamingStore.push(displayText)       ← store only sees clean text
    ↓
StreamingContent renders → user sees text
```

The extractor sits **between** the adapter callback and the store. The store never touches JSON. This is critical:

- **streamingStore stays a pure chunk buffer** — `push/finish/subscribe`, nothing else
- **The extractor is per-request** — created in `handleChunk` setup, garbage collected on completion
- **No global state** — the extractor instance lives in the closure scope of `sendMessage()`

### Why NOT in the Store

The store is a global singleton shared across the app. Making it JSON-aware means:
- It has two modes (structured vs plain) with branching in `push()`
- Its `start()` signature changes to accept a flag
- Testing the store requires testing JSON extraction
- The store's contract ("I buffer chunks") becomes "I buffer chunks and maybe parse JSON"

The extractor is request-scoped, not app-scoped. It belongs in the request's callback chain.

### Why NOT in the Adapter

Each adapter would need its own extractor instance. The full JSON wouldn't be accumulated in one place for completion parsing. And different adapters might stream JSON differently (though in practice they all stream token-by-token).

## JsonStreamExtractor Implementation

```typescript
// src/core/ai/streaming/jsonStreamExtractor.ts

/**
 * Extracts the `response` field's string value from a streaming JSON object.
 *
 * Designed for schemas like:
 *   { "response": "markdown text...", "suggestions": [...], "title": "..." }
 *
 * The extractor is a lightweight state machine:
 * - WAITING: scanning for `"response":"`
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
      const marker = '"response":"';
      const idx = this.buffer.indexOf(marker);
      if (idx === -1) return '';

      // Found the start — switch to extracting, process remainder
      this.state = 'extracting';
      this.buffer = this.buffer.slice(idx + marker.length);
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
```

### Newline Handling

In JSON strings, newlines are `\n` (two chars: backslash + n). The extractor maps `\n` → actual newline. Essential for markdown — paragraphs, code blocks, lists all depend on newlines.

### Unicode Handling

JSON strings can contain `\uXXXX`. The extractor accumulates the 4 hex digits after `\u` and emits `String.fromCharCode()`. Rare in natural language (models output UTF-8 directly) but handled for correctness.

### Performance

- One `fullJson += chunk` concatenation per chunk (same cost as current text accumulation)
- One character scan per chunk while in `extracting` state — negligible for typical chunk sizes
- No regex, no `JSON.parse()` during streaming
- Total overhead: **immeasurable** vs network latency and React rendering

## Integration: handleChunk in ChatContext

### Current handleChunk (ChatContext.tsx ~line 611)

```typescript
const handleChunk = (chunk: string, metadata?: StreamMetadata) => {
  // metadata handling (citations, thinking, searching)...
  if (chunk) {
    if (!hasFirstChunk) {
      hasFirstChunk = true;
      streamStartTime = Date.now();
      // transition to 'streaming' state
    }
    streamingStore.push(chunk);
  }
};
```

### New handleChunk

```typescript
// Create extractor if structured output is active
// `config` is the ChatRequestConfig from buildChatRequest()
const extractor = config.outputSchema ? new JsonStreamExtractor() : null;

const handleChunk = (chunk: string, metadata?: StreamMetadata) => {
  // metadata handling unchanged...
  if (chunk) {
    // Extract display text (or pass through if no structured output)
    const displayText = extractor ? extractor.push(chunk) : chunk;

    if (displayText) {
      if (!hasFirstChunk) {
        hasFirstChunk = true;
        streamStartTime = Date.now();
        // transition to 'streaming' state
      }
      streamingStore.push(displayText);
    }
  }
};
```

Changes:
1. `extractor` created from `config.outputSchema` — if schema exists, API-level enforcement is active, so we extract from JSON
2. Every chunk goes through `extractor.push()` which returns only display text
3. Store only receives clean, displayable text
4. If extractor returns empty (still in JSON preamble), nothing is pushed to store

### Completion Handler

```typescript
const streamResult = streamingStore.finish();

let mainText: string;
let suggestions: string[] | undefined;
let generatedTitle: string | undefined;

if (extractor) {
  // Structured output path — parse the accumulated JSON
  const fullJson = extractor.getFullJson();
  try {
    const parsed = JSON.parse(fullJson);
    mainText = parsed.response;
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined;
    generatedTitle = parsed.title || undefined;
  } catch {
    // Incomplete/malformed JSON — use what the extractor already output
    mainText = streamResult.text;
    suggestions = undefined;
  }
} else {
  // Fallback: delimiter parsing
  const textSections = streamResult.text.split('---SUGGESTIONS---');
  mainText = textSections[0].trim();
  suggestions = textSections[1]
    ? textSections[1].split('\n').map(s => s.trim()).filter(s => s && s.length > 2)
    : undefined;
}
```

Note: `mainText` from JSON.parse and `streamResult.text` from the store should be identical — the extractor output the same text that accumulated in the store. We use `parsed.response` as the authoritative source because it's the complete, properly unescaped value.

## Streaming Store — NO CHANGES

The store remains exactly as-is:

```typescript
export const streamingStore = {
  push(chunk: string) { /* append to last text part, emitChange */ },
  pushPart(part: ChatPart) { /* append media part, emitChange */ },
  start(msgId: string) { /* reset, set msgId, emitChange */ },
  finish(): { text: string; parts: ChatPart[] } { /* return accumulated, reset */ },
  reset() { /* clear without returning */ },
  getSnapshot(): StreamingSnapshot { /* return current */ },
  subscribe(listener: Listener): () => void { /* subscribe */ },
};
```

No new parameters. No new modes. No JSON awareness. It pushes text, it emits changes, it finishes. That's it.

## What the User Sees — Zero Visual Change

### During Streaming

The extractor strips the JSON wrapper. The user sees markdown text appearing progressively, exactly as today.

**First few chunks from adapter:**
```
{"response":"# Meeting Summary\n\nHere are the key
```

**What reaches the store:**
```
(nothing)  →  (nothing)  →  # Meeting Summary\n\nHere are the key
```

The `{"response":"` prefix is consumed silently by the extractor. The user never sees it.

### Initial Delay

~15-20 tokens of JSON preamble (`{"response":"`) before displayable text flows. At typical streaming speeds, this is 200-300ms. The user is already looking at the loading state (spinning icon), so this is imperceptible.

### Suggestions

With structured output, suggestions are inside the JSON and never stream to the user's view. Today, the `---SUGGESTIONS---\n...` section briefly flashes as raw text before being stripped. Structured output is a UX improvement here — suggestions appear cleanly in the ActionBar on completion, never as raw text during streaming.

### On Completion

ActionBar mounts with suggestions from `parsed.suggestions`. Title (if first message) from `parsed.title`. Same visual result, cleaner data source.

## Edge Cases

### 1. Abort/Stop Mid-Stream

User clicks Stop. The JSON will be incomplete. The extractor has already output whatever text it extracted. The completion handler catches the JSON parse error and uses `streamResult.text` (the accumulated display text from the store). No suggestions, no title — fine, the user stopped intentionally.

### 2. Malformed JSON

Shouldn't happen with constrained decoding. If it does: extractor outputs whatever text it found, JSON parse fails on completion, falls back to text-only. Graceful degradation.

### 3. Empty Response

Model generates `{"response":"","suggestions":["a","b","c"]}`. Extractor outputs nothing. Completion handler gets empty `response` + valid suggestions. Handled like today — empty responses show a fallback.

### 4. Multimodal Parts

Media parts bypass the extractor entirely — they flow through `onMediaPart` → `streamingStore.pushPart()`. The extractor only processes text chunks from `onChunk`. Media and text are separate streams, as they are today.

### 5. Metadata Chunks

When the adapter sends `onChunk('', { isSearching: true })`, the extractor receives an empty string and returns empty. The metadata flows through unchanged. No interaction with JSON extraction.

## Inline Citations Compatibility

Inline citations use character offsets (`startIndex`, `endIndex`) relative to the response text. With structured output, the `response` field IS the response text — offsets should be relative to its value.

**Potential issue**: If a provider computes citation offsets relative to the raw JSON output (including the `{"response":"` wrapper), offsets would be wrong relative to the extracted text.

**Expectation**: Providers compute offsets relative to semantic text content. OpenAI's Responses API returns annotations with `start_index`/`end_index` on the `output_text` content — this should be relative to the text within the format, not the JSON wrapper. Gemini's `groundingSupports` spans are similarly content-relative.

**Action**: Test explicitly with each provider. If offsets are wrong, compute an offset delta (length of JSON preamble) and subtract from all citation spans.

## Animation / Streamdown Compatibility

**No changes.** The store receives clean text chunks. Streamdown renders them with `animate={true}`. The source of the text is invisible to the rendering layer.

## File Changes Summary

| File | Change |
|------|--------|
| `src/core/ai/streaming/jsonStreamExtractor.ts` | **NEW** — `JsonStreamExtractor` class |
| `src/features/chat/stores/streamingStore.ts` | **NO CHANGES** |
| `src/shared/contexts/ChatContext.tsx` | Create extractor in `sendMessage()` closure, wrap `handleChunk`, parse JSON on completion |
| `StreamingContent` in ChatMessage.tsx | **NO CHANGES** |
| `StreamingMarkdown` | **NO CHANGES** |
