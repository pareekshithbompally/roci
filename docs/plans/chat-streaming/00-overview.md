# Structured Output Migration — Overview

## Goal

Replace all delimiter-based response parsing (`---SUGGESTIONS---`, `---TITLE---`, `---SUMMARY---`, etc.) and the separate title-generation LLM call with provider-native **structured output** (JSON schema enforcement). Consolidate all prompts into a single constants module. Make the architecture clean, lean, and uniform across all four adapter types.

## Current Problems

1. **Delimiter parsing is fragile** — regex splitting on `---TITLE---`, `---SUGGESTIONS---` etc. breaks when the model doesn't follow the format, includes the delimiter in content, or produces malformed output.

2. **Title generation is a separate LLM call** — after every first chat exchange, a second `adapter.chat()` call fires just to generate a 3-6 word title. This adds latency, costs tokens, and the result still needs 10 lines of regex cleanup.

3. **Suggestions are embedded in the text stream** — the `---SUGGESTIONS---` block streams to the user during generation (briefly visible as raw text before being stripped on completion), then gets parsed via string split.

4. **Prompts are scattered** — the main prompts live inline in `unifiedAIService.ts` (lines 16-120). Separate prompt files exist in `src/core/ai/prompts/` but are unused by the main flow. Two sources of truth, neither complete.

5. **No separation of concerns** — `unifiedAIService.ts` builds prompts, parses responses, orchestrates adapters, and handles transcription logic all in one file.

6. **Prompt and schema decisions are scattered** — the orchestrator imports `CHAT_SYSTEM_PROMPT` directly from `unifiedAIService`. If structured output is added, schema selection logic would duplicate across the unified service and orchestrator unless addressed.

## What Structured Output Gives Us

All three major providers now support **JSON schema enforcement** during generation:

| Provider | Parameter | With Streaming | With Web Search | With Tools |
|----------|-----------|---------------|-----------------|------------|
| **OpenAI** (Responses API) | `text: { format: { type: 'json_schema', name, schema, strict: true } }` | Yes | Yes | Yes |
| **Anthropic** | `output_config: { format: { type: 'json_schema', schema } }` | Yes | Yes | Yes |
| **Gemini** | `generationConfig: { responseMimeType: 'application/json', responseJsonSchema }` | Yes | Yes | Yes |
| **OpenAI-Compat** | `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }` | Depends on backend | N/A | Depends |

The model is **constrained at the token level** to produce valid JSON matching the schema. No prompt tricks, no delimiter hopes — guaranteed structure.

## Scope

### In Scope
- Structured output for **all chat responses** (streaming + non-streaming)
- Structured output for **transcription/document processing** (non-streaming)
- Eliminating the **separate title generation call** (fold into first chat exchange)
- Consolidating **all prompts** into `src/core/ai/prompts/`
- Consolidating **all response schemas** into `src/core/ai/schemas/`
- A **`ChatRequestConfig`** object that bundles prompt + schema + structured flag as a single unit, threaded through the entire call chain
- A **`JsonStreamExtractor`** in the callback chain (NOT inside the streaming store)
- Updating the **adapter interface** with a provider-agnostic output schema parameter
- Cleaning up **dead code** (unused prompt files, duplicate parsing, regex cleanup)

### Out of Scope
- Changing how web citations work (provider-native, already clean)
- Changing the tool-calling system (already schema-based)
- Changing the context pipeline
- Changing the RAG system
- UI redesign of suggestions or chat chrome

## Phases

| Phase | Document | Focus |
|-------|----------|-------|
| 1 | `01-schemas-and-prompts.md` | Define JSON schemas, consolidate prompts, `buildChatRequest()` that returns prompt+schema as a coupled pair |
| 2 | `02-adapter-layer.md` | Provider-agnostic `OutputSchema` interface, per-adapter mapping, tool loop timing per adapter style |
| 3 | `03-streaming-pipeline.md` | `JsonStreamExtractor` in the callback chain (store stays dumb), `ChatRequestConfig` threading |
| 4 | `04-chat-context-integration.md` | Wire ChatContext using `ChatRequestConfig`, single decision point for structured vs fallback |
| 5 | `05-transcription-migration.md` | Migrate transcription/document flows with `buildTranscriptionRequest()` |
| 6 | `06-cleanup.md` | Remove dead code, old prompts, old parsers, old title generation |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Streaming JSON means text is wrapped in `"response": "..."` — needs extraction during stream | Phase 3: `JsonStreamExtractor` in callback chain extracts display text before it hits the store |
| OpenAI-Compat (local models) may not support structured output | Prompt always describes JSON. If model can't do schema enforcement, `outputSchema` is undefined — no API-level constraint. Response parsing tries `JSON.parse()` first, falls back to delimiter extraction if it fails. |
| Structured output adds schema overhead to every request | Schemas are small (~500 bytes); negligible vs. prompt/response size |
| Some models may refuse or struggle with JSON + long markdown | All three major providers use constrained decoding (not prompt-based) — this is reliable |
| Inline citations use character offsets into response text | Offsets are relative to the `response` field value, not the JSON wrapper — should work unchanged |
| Gemini self-loops with tools internally — schema timing differs from orchestrator-driven adapters | Phase 2 specifies per-adapter-style schema timing strategy |
| Prompt describes JSON fields but schema not passed (or vice versa) | `buildChatRequest()` returns prompt + schema as an atomic pair — impossible to get one without the other |

## Key Design Decisions

1. **Schema-first**: Schemas are the contract. Prompts describe *what* to generate; schemas enforce *how* it's structured.

2. **Prompt + schema are coupled**: A single `buildChatRequest()` function returns `{ systemPrompt, outputSchema, includesTitle }` as an atomic unit. The prompt always describes JSON fields. The schema provides API-level enforcement. Neither the unified service nor the orchestrator decides schema selection independently.

3. **`ChatRequestConfig` is the single source of truth**: One object, built once per request, threaded through the entire chain — unified service, orchestrator, callback setup, completion parsing. No scattered `if (useStructured)` checks that could fall out of sync.

4. **Store stays dumb**: The streaming store (`streamingStore`) remains a pure chunk buffer with `push/finish/subscribe`. It has zero knowledge of JSON, structured output, or extraction. The `JsonStreamExtractor` lives in the callback chain between the adapter's `onChunk` and the store's `push()`.

5. **Provider-agnostic interface**: `OutputSchema` uses `name?: string` (optional). Adapters that need a name (OpenAI) derive or use it; adapters that don't (Anthropic, Gemini) ignore it. No provider-specific requirements leak into the shared interface.

6. **Graceful degradation**: If a provider/model doesn't support structured output, `buildChatRequest()` returns `outputSchema: undefined`. The prompt still describes JSON fields — it always does. Without API-level schema enforcement, the model may or may not comply. Response parsing handles this: `JSON.parse()` first, delimiter extraction as fallback.

7. **Per-adapter tool loop awareness**: Orchestrator-driven adapters (Anthropic, OpenAI) receive the schema on every iteration — structured output constrains text, not tool calls. Self-looping adapters (Gemini) apply the schema on session creation, with a documented strategy for deferring to the final text pass if needed.
