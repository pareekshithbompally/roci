# Phase 6 — Sentinel Cleanup (Revised)

## What Changed

The backend now uses **structured output** via JSON schemas (`chat.schema.ts`). The streaming pipeline works:

1. LLM streams JSON: `{"response":"markdown text...","suggestions":[...]}`
2. `JsonStreamExtractor` extracts only the `response` field's text during streaming
3. `streamingStore` only ever receives clean display text
4. On completion, `JSON.parse(fullJson)` extracts `suggestions` and `title` as structured data

The `---SUGGESTIONS---` sentinel is now a **fallback path** for models where `supportsStructuredOutput === false`. This fallback still exists in:
- **ChatContext.tsx:812-816** — delimiter split on stream completion (fallback only)
- **ChatContext.tsx:823** — part text cleanup (fallback only)
- **ChatMessage.tsx:77** — `StreamingContent` splits `part.text` during rendering

## What to do

### 6.1 Remove the split from StreamingContent (line 77)

```diff
- const displayText = part.text.split('---SUGGESTIONS---')[0].trim();
+ const displayText = part.text;
```

**Why this is safe:**

- **Structured output path** (most models): `JsonStreamExtractor` already strips the JSON wrapper. The streaming store only contains the `response` field's text. No sentinel ever reaches `StreamingContent`.

- **Fallback path** (models without structured output): The sentinel could theoretically appear during streaming. But in practice, suggestions come at the very end of the response. The user would see `---SUGGESTIONS---` for at most 1-2 frames before the stream completes and ChatContext cleans it up.

**Pragmatic decision:** Remove the split from the renderer. If the fallback path's brief flash is unacceptable, the fix belongs in `handleChunk` (ChatContext), not in a rendering component. But given that structured output is the primary path now, this is not worth the complexity.

### 6.2 Keep the ChatContext fallback parsing

The delimiter parsing at ChatContext.tsx:812-823 should stay for now. It's the fallback for models that don't support structured output. Removing it would break those models.

When all supported models have structured output, this fallback can be deleted in a separate cleanup pass.

### 6.3 No other changes needed

The prompt (`chat.prompt.ts`) no longer mentions `---SUGGESTIONS---`. It describes JSON fields instead. The `buildChatRequest` function always includes the structured instruction text. The schema enforcement is handled by adapters.

## Checklist

- [ ] Remove `part.text.split('---SUGGESTIONS---')[0].trim()` from `StreamingContent` / `PartsList`
- [ ] Replace with `part.text` (or `part.text.trim()` if whitespace trimming is still desired)
- [ ] Keep ChatContext fallback delimiter parsing (lines 810-816, 823) — it serves non-structured-output models
- [ ] Verify: streaming with a structured-output model shows clean text (no JSON wrapper)
- [ ] Verify: streaming with a fallback model still works (suggestions parsed on completion)
