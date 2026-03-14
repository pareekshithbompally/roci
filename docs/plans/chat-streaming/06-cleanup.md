# Phase 6 — Cleanup & Dead Code Removal

## Objective

After Phases 1-5 are implemented and tested, remove all dead code, duplicate prompts, old parsers, and redundant logic. Make the codebase lean.

## What Gets Deleted

### 1. Inline Prompts in `unifiedAIService.ts`

**Delete lines 14-120** — the entire inline prompt section:

```typescript
// DELETE: TRANSCRIPTION_PROMPT (lines 16-59)
const TRANSCRIPTION_PROMPT = (categories: string[]) => `You are a professional...`

// DELETE: CHAT_SYSTEM_PROMPT (lines 61-120)
export const CHAT_SYSTEM_PROMPT = (contextBlock?, options?) => { ... }
```

These are replaced by `buildChatRequest()` and `buildTranscriptionRequest()` from `src/core/ai/requestBuilder.ts`. The unified service no longer builds prompts — it receives them.

### 2. `parseChatResponse()` in `unifiedAIService.ts`

**Delete lines 400-413:**
```typescript
// DELETE
private parseChatResponse(rawText: string): { text: string; suggestions: string[] } {
  const parts = rawText.split('---SUGGESTIONS---');
  // ...
}
```

Replaced by `JSON.parse(extractor.getFullJson())` in ChatContext's completion handler.

### 3. Title Generation Post-Processing

**Delete the regex cleanup in `generateTitle()` (lines 325-356):**
```typescript
// DELETE all of this:
let title = result.text
  .split('\n')[0]
  .trim()
  .replace(/^[#*\-–—•>]+\s*/g, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  // ... 8 more regex lines ...
```

When structured output generates the title, it's already a clean string. `generateTitle()` itself is kept as a fallback for models without structured output, but the regex cleanup is only needed in that fallback path and can be drastically simplified.

### 4. `CHAT_SYSTEM_PROMPT` Export

The orchestrator currently imports this:
```typescript
import { CHAT_SYSTEM_PROMPT } from '@/services/unifiedAIService';
```

This import was already removed in Phase 4 (orchestrator receives prompt from ChatRequestConfig). The export from `unifiedAIService` can now be deleted.

### 5. Suggestions Delimiter Stripping in StreamingContent

Currently in `ChatMessage.tsx`, streaming text is stripped of the `---SUGGESTIONS---` section:
```typescript
const displayText = text.split('---SUGGESTIONS---')[0];
```

With structured output, the extractor never outputs suggestion text to the store. This stripping becomes a no-op. For the fallback path, the delimiter is still present.

**Decision**: Keep the split as a safety net — it's a single line, no performance cost, and handles both paths. Mark with a comment:

```typescript
// Safety net: strip suggestions delimiter if present (fallback path only;
// structured output path never includes this in the store)
const displayText = text.includes('---SUGGESTIONS---')
  ? text.split('---SUGGESTIONS---')[0]
  : text;
```

### 6. Unused Prompt Files

**Delete:**
- `src/core/ai/prompts/summary.prompt.ts` — completely unused by any flow

**The old content** of `chat.prompt.ts` and `transcription.prompt.ts` was overwritten in Phase 1 with new implementations. Nothing to delete — they were rewritten in place.

### 7. Console Logs

Remove debug console.logs:
```typescript
// From ChatContext.tsx:
console.log('[ChatContext] Stream complete — web citations:', ...);

// From adapters:
console.log('[OpenAIAdapter] Found annotations:', ...);
console.log('[UnifiedAIService] chatStream - provider:', ...);

// From orchestrator:
console.log('[Orchestrator] Starting with', ...);
console.log('[Orchestrator] Iteration', ...);
```

These were useful during development. Replace with structured logging or remove entirely.

## What Gets Simplified

### `unifiedAIService.ts` — Before vs After

**Before (~440 lines):**
```
Lines 1-120:   Inline prompts (TRANSCRIPTION_PROMPT, CHAT_SYSTEM_PROMPT)
Lines 122-288: Service methods (processAudio, processDocument, chat, chatStream, chatStreamWithTools)
Lines 290-357: generateTitle (with 30 lines of regex cleanup)
Lines 359-440: Response parsers (parseTranscriptionResponse, parseChatResponse, parseStructuredSummary)
```

**After (~200 lines):**
```
Lines 1-10:    Imports from @/core/ai
Lines 12-100:  Service methods — thinner, receive prompt+schema, delegate to adapters
Lines 102-140: generateTitle (kept as fallback, simplified)
Lines 142-180: parseTranscriptionResult (structured + legacy fallback)
Lines 182-210: parseStructuredSummary (content parsing — unchanged)
Lines 212-250: parseTranscriptionResponseLegacy (old regex, kept as fallback)
```

**~240 lines removed.** Prompt building gone. Schema selection gone. Chat response parsing gone (moved to ChatContext). The service is now a thin orchestrator — resolve adapter, forward options, parse transcription results.

### `ChatContext.tsx` — Completion Handler

**Before:** ~70 lines of delimiter splitting, suggestion parsing, title fire-and-forget

**After:** ~35 lines of JSON parsing with clean fallback. Title from same response.

### `tool-orchestrator/index.ts`

**Before:** Imports `CHAT_SYSTEM_PROMPT`, conditionally builds its own prompt

**After:** Receives `systemPrompt` and `outputSchema` from options. No prompt imports, no prompt building. Pure execution loop.

## Migration Safety

### Feature Flag

Add a simple flag for safety:

```typescript
// In src/core/ai/types.ts or a config
export const ENABLE_STRUCTURED_OUTPUT = true;
```

Pass this as `supportsStructuredOutput` override in `buildChatRequest()`:

```typescript
const config = buildChatRequest({
  ...options,
  supportsStructuredOutput: ENABLE_STRUCTURED_OUTPUT && modelCaps?.structuredOutput !== false,
});
```

Flip to `false` to disable API-level schema enforcement. The prompt still describes JSON — but without schema enforcement, models may not comply. Response parsing falls back to delimiter extraction.

### Rollback Plan

1. All old parsing code is preserved as fallback (behind `if (extractor)` / `if (isStructured)` branches)
2. The prompt always describes JSON — response parsing falls back to delimiter extraction if `JSON.parse()` fails
3. `generateTitle()` is preserved as fallback
4. Flipping `ENABLE_STRUCTURED_OUTPUT = false` disables schema enforcement — prompt unchanged, response parsing handles non-JSON gracefully

### Testing Checklist

Before removing any fallback code:

**Chat Flow:**
- [ ] Chat with Anthropic → suggestions from JSON, title from JSON (first message)
- [ ] Chat with OpenAI → suggestions + web search + citations coexist with structured output
- [ ] Chat with Gemini → suggestions + grounding coexist with structured output
- [ ] Chat with OpenAI-Compat → fallback to delimiter parsing works
- [ ] Second message → no title field, suggestions still work
- [ ] Stop mid-stream → partial text displayed, no crash from incomplete JSON
- [ ] Tool calling (Anthropic) → suggestions appear after tool results
- [ ] Tool calling (OpenAI) → same
- [ ] Tool calling (Gemini, self-looping) → same, schema doesn't block function calls
- [ ] Rerun last message → works correctly

**Transcription Flow:**
- [ ] Audio recording → structured JSON parsed correctly, all fields populated
- [ ] Categories are a proper array (not comma-separated string)
- [ ] VTT import → same
- [ ] PDF import → same
- [ ] TXT import → same
- [ ] Re-transcription → same

**Edge Cases:**
- [ ] Model that doesn't support structured output → delimiter fallback fires
- [ ] Network error mid-stream → partial text preserved
- [ ] Very long response (>10k tokens) → streaming + extraction handle correctly
- [ ] Response with code blocks containing `"` and `\n` → JSON escapes handled
- [ ] Inline citations → character offsets still correct with structured output

## Final File Inventory

### New Files (Phases 1-3)

| File | Purpose |
|------|---------|
| `src/core/ai/types.ts` | `OutputSchema`, `ChatRequestConfig`, `TranscriptionRequestConfig` |
| `src/core/ai/schemas/chat.schema.ts` | Chat response JSON schemas + TypeScript types |
| `src/core/ai/schemas/transcription.schema.ts` | Transcription JSON schema + TypeScript type |
| `src/core/ai/schemas/index.ts` | Barrel export |
| `src/core/ai/streaming/jsonStreamExtractor.ts` | JSON stream text extractor |
| `src/core/ai/requestBuilder.ts` | `buildChatRequest()`, `buildTranscriptionRequest()` |
| `src/core/ai/index.ts` | Barrel export |

### Modified Files

| File | Summary |
|------|---------|
| `services/adapters/types.ts` | Import `OutputSchema`, add to options |
| `services/adapters/openai.adapter.ts` | Map to `text.format`, default `name` |
| `services/adapters/anthropic.adapter.ts` | Map to `output_config.format`, ignore `name` |
| `services/adapters/gemini.adapter.ts` | Map to `responseMimeType` + `responseJsonSchema`, ignore `name` |
| `services/adapters/openai-compat.adapter.ts` | Map to `response_format`, default `name` |
| `services/unifiedAIService.ts` | Remove inline prompts, receive config, thin down |
| `src/shared/contexts/ChatContext.tsx` | Build config, create extractor, wrap handleChunk, JSON completion |
| `extensions/tool-orchestrator/index.ts` | Remove prompt import, receive config |
| `extensions/tool-orchestrator/types.ts` | Add `outputSchema?`, make `systemPrompt` required |
| `src/core/ai/prompts/chat.prompt.ts` | Rewritten — always describes JSON output fields |
| `src/core/ai/prompts/transcription.prompt.ts` | Rewritten — always describes JSON output fields |
| `src/core/ai/prompts/document.prompt.ts` | Rewritten — always describes JSON output fields |

### Deleted Files

| File | Reason |
|------|--------|
| `src/core/ai/prompts/summary.prompt.ts` | Unused |

### Deleted Code (within files)

| Location | What | Lines |
|----------|------|-------|
| `unifiedAIService.ts:16-59` | Inline `TRANSCRIPTION_PROMPT` | ~45 |
| `unifiedAIService.ts:61-120` | Inline `CHAT_SYSTEM_PROMPT` + export | ~60 |
| `unifiedAIService.ts:400-413` | `parseChatResponse()` | ~15 |
| `unifiedAIService.ts:325-356` | Title regex cleanup (most of it) | ~25 |
| Various | Console.log debug statements | ~15 |
| **Total** | | **~160 lines** |

## End State

After all six phases:

1. **Zero delimiter parsing** in the primary path (Anthropic/OpenAI/Gemini)
2. **Zero separate title LLM calls** for the primary path
3. **One decision point** for structured output: `buildChatRequest()` / `buildTranscriptionRequest()`
4. **One config object** (`ChatRequestConfig`) threaded through the entire chain
5. **Store stays dumb** — pure chunk buffer, no JSON awareness
6. **Extractor in callback chain** — per-request lifecycle, no global state
7. **Provider-agnostic interface** — `OutputSchema.name` is optional, adapters handle their own needs
8. **All prompts** in `src/core/ai/prompts/` — single source of truth
9. **All schemas** in `src/core/ai/schemas/` — single source of truth
10. **Prompt + schema always paired** — `buildChatRequest()` returns them atomically
11. **Fallback preserved** — delimiter parsing for models without structured output
12. **No UI changes** — users see identical behavior
13. **~160 lines of scattered parsing/prompt code removed**, replaced by ~120 lines of clean schemas + extractor + request builders
