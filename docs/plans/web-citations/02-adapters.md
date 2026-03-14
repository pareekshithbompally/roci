# Phase 2: Per-Adapter Citation Extraction

## Overview

Each adapter needs to extract web citation data from its provider's response format and deliver it via `StreamMetadata.webCitations` and `StreamMetadata.inlineCitations`. Citations arrive on the final chunk(s) — not incrementally during streaming.

---

## 2.1 — Gemini Adapter

**File:** `services/adapters/gemini.adapter.ts`

### Provider SDK Shape

Gemini returns `groundingMetadata` on response chunks (typically the last chunk):

```typescript
// chunk.groundingMetadata (accessed via `chunk as any`)
{
  groundingChunks: [
    { web: { uri: string; title: string } },
    // ...
  ],
  groundingSupports: [
    {
      segment: { startIndex: number; endIndex: number; text: string },
      groundingChunkIndices: number[],
      confidenceScores: number[],
    },
    // ...
  ],
  searchEntryPoint?: { ... },  // ignored
  webSearchQueries?: string[], // already captured as searchQuery
}
```

### Changes to `chatStream()` (lines 96-111)

Currently, the grounding metadata block (lines 96-104) only extracts `isSearching` and `searchQuery`. Extend it to also capture citations:

```typescript
// Check for grounding metadata (web search)
const chunkData = chunk as any;
const metadata: any = {};
if (chunkData.groundingMetadata) {
  metadata.isSearching = true;
  if (chunkData.groundingMetadata.searchQuery) {
    metadata.searchQuery = chunkData.groundingMetadata.searchQuery;
  }

  // ── NEW: Extract web citations from grounding chunks ──
  const groundingChunks = chunkData.groundingMetadata.groundingChunks;
  if (Array.isArray(groundingChunks) && groundingChunks.length > 0) {
    metadata.webCitations = groundingChunks
      .filter((gc: any) => gc.web?.uri)
      .map((gc: any) => ({
        url: gc.web.uri,
        title: gc.web.title || '',
        snippet: undefined, // Gemini doesn't provide snippets in groundingChunks
      }));

    // Extract inline citation spans from groundingSupports
    const supports = chunkData.groundingMetadata.groundingSupports;
    if (Array.isArray(supports) && supports.length > 0) {
      metadata.inlineCitations = supports
        .filter((s: any) => s.segment && Array.isArray(s.groundingChunkIndices))
        .map((s: any) => ({
          startIndex: s.segment.startIndex ?? 0,
          endIndex: s.segment.endIndex ?? 0,
          sourceIndices: s.groundingChunkIndices,
        }));
    }
  }
}
```

### Changes to `chatStreamWithTools()` (lines 173-207)

The `drainStream()` helper also needs to capture grounding metadata. Add the same extraction logic inside the `for await` loop, passing metadata to `onChunk`:

```typescript
// Inside drainStream(), after checking chunk.candidates parts:
const chunkData = chunk as any;
if (chunkData.groundingMetadata) {
  const groundingChunks = chunkData.groundingMetadata.groundingChunks;
  if (Array.isArray(groundingChunks) && groundingChunks.length > 0) {
    const citationMeta: any = {
      webCitations: groundingChunks
        .filter((gc: any) => gc.web?.uri)
        .map((gc: any) => ({
          url: gc.web.uri,
          title: gc.web.title || '',
        })),
    };
    const supports = chunkData.groundingMetadata.groundingSupports;
    if (Array.isArray(supports) && supports.length > 0) {
      citationMeta.inlineCitations = supports
        .filter((s: any) => s.segment && Array.isArray(s.groundingChunkIndices))
        .map((s: any) => ({
          startIndex: s.segment.startIndex ?? 0,
          endIndex: s.segment.endIndex ?? 0,
          sourceIndices: s.groundingChunkIndices,
        }));
    }
    onChunk('', citationMeta);
  }
}
```

### Verification
- Enable web search with a Gemini model, send a factual query ("What is the population of Tokyo?")
- Check console: `groundingMetadata` should appear on chunks
- `StreamMetadata.webCitations` should contain at least one URL
- `StreamMetadata.inlineCitations` should map text spans to source indices

---

## 2.2 — Anthropic Adapter

**File:** `services/adapters/anthropic.adapter.ts`

### Provider SDK Shape

When `web_search` tool is enabled, Anthropic's stream emits `content_block_start` events with `web_search_tool_result` blocks:

```typescript
// content_block_start event
{
  type: 'content_block_start',
  content_block: {
    type: 'web_search_tool_result',
    search_results: [
      {
        type: 'web_search_result',
        url: string,
        title: string,
        encrypted_content: string,  // we cannot use this
        page_age?: string,
      },
      // ...
    ]
  }
}
```

The actual text response references sources by position — Anthropic does not provide explicit inline span mappings, but sources appear in order of use.

### Changes to `chatStream()` (lines 70-83)

Add a branch to handle `content_block_start` with `web_search_tool_result`:

```typescript
// Add before the existing for-await loop, at the top of the function scope:
const collectedWebCitations: Array<{ url: string; title: string; snippet?: string }> = [];

// Inside the for-await loop, add a new branch:
for await (const event of stream) {
  if (signal?.aborted) break;

  // NEW: Capture web search results
  if (event.type === 'content_block_start') {
    const block = (event as any).content_block;
    if (block?.type === 'web_search_tool_result' && Array.isArray(block.search_results)) {
      for (const result of block.search_results) {
        if (result.url) {
          collectedWebCitations.push({
            url: result.url,
            title: result.title || '',
            snippet: undefined, // encrypted_content is not usable
          });
        }
      }
    }
  }

  // Existing: text_delta and thinking_delta handling
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'thinking_delta') {
      onChunk('', {
        isThinking: true,
        thinkingContent: (event.delta as any).thinking || '',
      });
    } else if (event.delta.type === 'text_delta') {
      onChunk((event.delta as any).text || '');
    }
  }
}

// NEW: After the loop, emit collected citations as final metadata
if (collectedWebCitations.length > 0) {
  onChunk('', { webCitations: collectedWebCitations });
}
```

### Changes to `chatStreamWithTools()` (lines 155-182)

Same pattern — add `content_block_start` handling in the tool-aware stream loop:

```typescript
// Add at the top of the function scope:
const collectedWebCitations: Array<{ url: string; title: string; snippet?: string }> = [];

// Inside the for-await loop, extend the content_block_start handler (line 158):
if (event.type === 'content_block_start') {
  const block = (event as any).content_block;
  if (block?.type === 'tool_use') {
    currentToolBlockIdx = pendingToolBlocks.length;
    pendingToolBlocks.push({ id: block.id, name: block.name, inputJson: '' });
  }
  // NEW: capture web search results
  if (block?.type === 'web_search_tool_result' && Array.isArray(block.search_results)) {
    for (const result of block.search_results) {
      if (result.url) {
        collectedWebCitations.push({
          url: result.url,
          title: result.title || '',
        });
      }
    }
  }
}

// After the loop (after line 193), emit citations:
if (collectedWebCitations.length > 0) {
  onChunk('', { webCitations: collectedWebCitations });
}
```

### Note on inline citations
Anthropic does not provide explicit start/end index mappings for inline citations. The `inlineCitations` array will be empty for Anthropic responses. If Anthropic adds this feature later, we can extend the adapter.

### Verification
- Enable web search with an Anthropic model (Claude), send a factual query
- Monitor stream events for `content_block_start` with `web_search_tool_result`
- After stream completes, verify `onChunk('', { webCitations: [...] })` is called
- Web citations should have valid URLs and titles

---

## 2.3 — OpenAI Adapter

**File:** `services/adapters/openai.adapter.ts`

### Provider SDK Shape

OpenAI's Responses API returns annotations on output items in the final response:

```typescript
// From runner.finalResponse():
{
  output: [
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'The population of Tokyo is approximately 14 million...',
          annotations: [
            {
              type: 'url_citation',
              start_index: number,
              end_index: number,
              url: string,
              title: string,
            },
            // ...
          ]
        }
      ]
    }
  ]
}
```

### Changes to `chatStream()` (lines 51-73)

Capture citations from `finalResponse()`:

```typescript
const runner = client.responses
  .stream({
    model: resolved.modelId,
    input,
    ...(tools.length > 0 && { tools }),
  })
  .on('response.output_text.delta', (event: any) => {
    onChunk(event.delta);
  })
  .on('response.web_search_call.searching', () => {
    onChunk('', { isSearching: true });
  });

// Existing abort signal wiring...

const finalResponse = await runner.finalResponse();

// NEW: Extract citations from final response annotations
const webCitations: Array<{ url: string; title: string }> = [];
const inlineCitations: Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }> = [];
const urlToIndex = new Map<string, number>();

if (finalResponse?.output) {
  for (const item of finalResponse.output) {
    if (item.type !== 'message') continue;
    for (const content of (item as any).content || []) {
      if (content.type !== 'output_text' || !Array.isArray(content.annotations)) continue;
      for (const ann of content.annotations) {
        if (ann.type !== 'url_citation' || !ann.url) continue;

        // Build unique citation list
        let sourceIdx: number;
        if (urlToIndex.has(ann.url)) {
          sourceIdx = urlToIndex.get(ann.url)!;
        } else {
          sourceIdx = webCitations.length;
          urlToIndex.set(ann.url, sourceIdx);
          webCitations.push({ url: ann.url, title: ann.title || '' });
        }

        // Build inline span
        if (typeof ann.start_index === 'number' && typeof ann.end_index === 'number') {
          inlineCitations.push({
            startIndex: ann.start_index,
            endIndex: ann.end_index,
            sourceIndices: [sourceIdx],
          });
        }
      }
    }
  }
}

if (webCitations.length > 0) {
  onChunk('', { webCitations, ...(inlineCitations.length > 0 && { inlineCitations }) });
}
```

### Changes to `chatStreamWithTools()` (lines 131-159)

Same pattern — extract from `finalResponse()` after the runner completes:

```typescript
const finalResponse = await runner.finalResponse();

// NEW: Extract web citations (same logic as chatStream)
const webCitations: Array<{ url: string; title: string }> = [];
const inlineCitations: Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }> = [];
const urlToIndex = new Map<string, number>();

if (finalResponse?.output) {
  for (const item of finalResponse.output) {
    if (item.type !== 'message') continue;
    for (const content of (item as any).content || []) {
      if (content.type !== 'output_text' || !Array.isArray(content.annotations)) continue;
      for (const ann of content.annotations) {
        if (ann.type !== 'url_citation' || !ann.url) continue;
        let sourceIdx: number;
        if (urlToIndex.has(ann.url)) {
          sourceIdx = urlToIndex.get(ann.url)!;
        } else {
          sourceIdx = webCitations.length;
          urlToIndex.set(ann.url, sourceIdx);
          webCitations.push({ url: ann.url, title: ann.title || '' });
        }
        if (typeof ann.start_index === 'number' && typeof ann.end_index === 'number') {
          inlineCitations.push({
            startIndex: ann.start_index,
            endIndex: ann.end_index,
            sourceIndices: [sourceIdx],
          });
        }
      }
    }
  }
}

if (webCitations.length > 0) {
  onChunk('', { webCitations, ...(inlineCitations.length > 0 && { inlineCitations }) });
}

// Existing: emit function calls if collected
if (functionCalls.length > 0) {
  const toolCalls = parseOpenAIToolCalls(functionCalls);
  onToolCall({ toolCalls, textBefore: textBefore || undefined });
}
```

### Helper extraction (optional refactor)

Since the OpenAI citation extraction logic is identical in both methods, consider extracting a helper:

```typescript
function extractOpenAICitations(finalResponse: any): {
  webCitations: Array<{ url: string; title: string }>;
  inlineCitations: Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }>;
} | null {
  // ... same logic as above ...
}
```

This keeps both methods DRY but is an optional refactor — can be done in the same PR or later.

### Verification
- Enable web search with an OpenAI model, send a factual query
- `runner.finalResponse()` should contain `url_citation` annotations
- `onChunk('', { webCitations, inlineCitations })` called after streaming
- Inline citations should have valid start/end indices within the response text

---

## Summary: Adapter Citation Timing

| Provider | When citations arrive | Inline spans? |
|----------|----------------------|---------------|
| **Gemini** | On `groundingMetadata` chunks (late/final) | Yes — `groundingSupports` |
| **Anthropic** | On `content_block_start` events during stream | No — not provided by API |
| **OpenAI** | After `finalResponse()` completes | Yes — `url_citation` annotations |

All three adapters deliver citations via `onChunk('', { webCitations, inlineCitations? })` — the ChatContext consumer doesn't need to know which provider produced them.

---

## Phase 2 Checklist

- [ ] Gemini adapter extracts `groundingChunks` → `WebCitation[]` and `groundingSupports` → `InlineCitationSpan[]`
- [ ] Anthropic adapter captures `web_search_tool_result` blocks → `WebCitation[]`
- [ ] OpenAI adapter extracts `url_citation` annotations → `WebCitation[]` + `InlineCitationSpan[]`
- [ ] All three adapters emit citations via `onChunk('', { webCitations, ... })`
- [ ] Tool-aware streaming methods (`chatStreamWithTools`) also extract citations
- [ ] No breaking changes to existing streaming behavior
- [ ] Console log verification for each provider with web search enabled
