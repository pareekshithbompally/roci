# Phase 4 — ChatContext Integration

## Objective

Wire ChatContext and the unified service to use `ChatRequestConfig` from `buildChatRequest()`. The config is built ONCE per request and threaded through every layer. No scattered decision-making about schemas or prompts.

## The Single Decision Point

Every chat request starts with one call:

```typescript
const config = buildChatRequest({
  contextBlock,
  hasTools,
  meetingCount: historyItems.length,
  isFirstMessage,
  supportsStructuredOutput: modelCapabilities?.structuredOutput !== false,
});
```

This returns `ChatRequestConfig`:
- `systemPrompt` — the prompt matching the output format
- `outputSchema` — the schema to pass to the adapter (or undefined)
- `includesTitle` — whether title field is in the schema

Everything downstream reads from this config. Nothing recalculates or second-guesses it.

## Flow: Who Builds the Config, Who Consumes It

```
ChatContext.sendMessage()
    │
    ├─ resolveModel() → get model capabilities
    │
    ├─ buildChatRequest({ supportsStructuredOutput, isFirstMessage, ... })
    │      → returns ChatRequestConfig
    │
    ├─ Create JsonStreamExtractor (if config.outputSchema)
    │
    ├─ Define handleChunk (uses extractor)
    │
    ├─ Route:
    │   ├─ Tools path: orchestrate(options with config)
    │   │     └─ orchestrator reads config.systemPrompt + config.outputSchema
    │   │         └─ adapter.chatStreamWithTools({ outputSchema: config.outputSchema, ... })
    │   │
    │   └─ Clean path: unifiedAIService.chatStream(config, ...)
    │         └─ adapter.chatStream({ outputSchema: config.outputSchema, ... })
    │
    ├─ On completion:
    │   ├─ if extractor → JSON.parse(extractor.getFullJson()) → { response, suggestions, title }
    │   └─ else → delimiter split (fallback)
    │
    └─ if config.includesTitle && generatedTitle → renameSession()
       else if isNewSession → fallback generateTitle()
```

## Changes to ChatContext.tsx

### 1. Model Capability Resolution

ChatContext needs model capabilities to pass to `buildChatRequest()`. Currently `resolveModel()` happens inside the unified service. We need it earlier.

**New — resolve model and get capabilities in ChatContext:**

```typescript
// In sendMessage(), before streaming setup
const resolved = resolveModel(settings.chatModel, providers);
if (!resolved) throw new Error(...);

const modelCaps = getModelCapabilities(resolved.provider, resolved.modelId);
const isFirstMessage = targetSession.messages.filter(m => m.role === 'user').length === 0;

const config = buildChatRequest({
  contextBlock,
  hasTools: !!adapter.chatStreamWithTools,
  meetingCount: historyItems.length,
  isFirstMessage,
  supportsStructuredOutput: modelCaps?.structuredOutput !== false,
});
```

`getModelCapabilities()` is already available from `services/modalities.ts`. It's cached (24h localStorage). No network call.

### 2. Extractor Setup (in sendMessage closure)

```typescript
// Right after building config
const extractor = config.outputSchema ? new JsonStreamExtractor() : null;
```

The extractor lives in the `sendMessage()` closure. It's created per-request, garbage collected when the request completes. No global state.

### 3. handleChunk Wrapper

```typescript
const handleChunk = (chunk: string, metadata?: StreamMetadata) => {
  if (metadata) {
    // Web citations, thinking, searching — unchanged
    if (metadata.webCitations) { /* accumulate */ }
    if (metadata.inlineCitations) { /* accumulate */ }
    setState(prev => ({ ...prev, aiActivity: metadata }));
  }

  if (chunk) {
    const displayText = extractor ? extractor.push(chunk) : chunk;

    if (displayText) {
      if (!hasFirstChunk) {
        hasFirstChunk = true;
        streamStartTime = Date.now();
        setState(prev => /* transition to streaming state */);
      }
      streamingStore.push(displayText);
    }
  }
};
```

The ONLY difference from today: `extractor.push(chunk)` wraps the chunk before it hits the store. Everything else — metadata, first-chunk detection, state transitions — is identical.

### 4. Routing to Unified Service / Orchestrator

**Clean path (no tools):**

The unified service receives the config's fields:

```typescript
await unifiedAIService.chatStream({
  messages: allMessages,
  settings,
  providers,
  onChunk: handleChunk,
  systemPrompt: config.systemPrompt,      // from config
  outputSchema: config.outputSchema,       // from config
  webSearchEnabled,
  signal,
  onMediaPart: handleMediaPart,
});
```

The unified service becomes thinner — it no longer builds prompts or selects schemas. It receives them and passes to the adapter.

**Tools path (orchestrator):**

```typescript
await orchestrate({
  messages: allMessages,
  systemPrompt: config.systemPrompt,       // from config
  outputSchema: config.outputSchema,       // from config
  contextBlock,
  settings,
  providers,
  historyItems,
  signal,
  webSearchEnabled,
}, {
  onChunk: handleChunk,
  onMediaPart: handleMediaPart,
  onToolActivity,
});
```

The orchestrator no longer imports `CHAT_SYSTEM_PROMPT`. It no longer builds its own prompt. It receives the prompt and schema from the config.

### 5. Completion Handler — The Big Change

**Current (delimiter parsing):**
```typescript
const streamResult = streamingStore.finish();
const fullText = streamResult.text;
const textSections = fullText.split('---SUGGESTIONS---');
const mainText = textSections[0].trim();
const suggestions = textSections[1]
  ? textSections[1].split('\n').map(s => s.trim()).filter(s => s && s.length > 2)
  : undefined;
```

**New (config-aware):**
```typescript
const streamResult = streamingStore.finish();

let mainText: string;
let suggestions: string[] | undefined;
let generatedTitle: string | undefined;

if (extractor) {
  // Structured output path
  try {
    const parsed = JSON.parse(extractor.getFullJson());
    mainText = parsed.response;
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined;
    generatedTitle = parsed.title || undefined;
  } catch {
    // Incomplete/malformed — use extracted display text, no suggestions
    mainText = streamResult.text;
  }
} else {
  // Fallback: delimiter parsing (unchanged)
  const textSections = streamResult.text.split('---SUGGESTIONS---');
  mainText = textSections[0].trim();
  suggestions = textSections[1]
    ? textSections[1].split('\n').map(s => s.trim()).filter(s => s && s.length > 2)
    : undefined;
}
```

Note: the `if (extractor)` check is equivalent to `if (config.outputSchema)`. We check the extractor because it's the concrete artifact — if it exists, API-level schema enforcement was active.

### 6. Title Handling

**Current:**
```typescript
if (isNewSession) {
  unifiedAIService.generateTitle(textToSend, mainText, settings, providers)
    .then(title => renameSession(activeSessionId, title));
}
```

**New:**
```typescript
if (isNewSession) {
  if (generatedTitle) {
    // Title came from structured output — zero extra cost
    renameSession(activeSessionId, generatedTitle);
  } else {
    // Fallback — model didn't support structured output
    unifiedAIService.generateTitle(textToSend, mainText, settings, providers)
      .then(title => renameSession(activeSessionId, title));
  }
}
```

For Anthropic/OpenAI/Gemini: title is in the JSON, no second call.
For OpenAI-Compat: falls back to separate call.

### 7. Stop/Abort Flow

```typescript
// In stopGeneration()
const streamResult = streamingStore.finish();
let stoppedText = streamResult.text; // display text already extracted by extractor

// If structured output was active, try to salvage
if (extractor) {
  try {
    const parsed = JSON.parse(extractor.getFullJson());
    stoppedText = parsed.response;
  } catch {
    // Partial JSON — use extracted text as-is (already in streamResult.text)
  }
}

// No suggestions, no title — user stopped intentionally
```

### 8. Rerun Last Message

No changes. This re-sends the user message, triggering the same flow from scratch. `buildChatRequest()` gets called again with the same inputs, produces the same config.

## Unified Service Changes

The unified service becomes thinner. It no longer builds prompts or selects schemas — that's `buildChatRequest()`'s job.

### Current (fat)

```typescript
async chatStream(messages, settings, providers, onChunk, contextBlock, webSearchEnabled, signal, onMediaPart) {
  const resolved = resolveModel(settings.chatModel, providers);
  const adapter = getAdapter(getProviderType(resolved.provider));
  const systemPrompt = CHAT_SYSTEM_PROMPT(contextBlock); // builds prompt
  await adapter.chatStream({ messages, resolved, systemPrompt, webSearchEnabled, signal }, { onChunk, onMediaPart });
}
```

### New (thin)

```typescript
async chatStream(options: {
  messages: ChatMessage[];
  resolved: ResolvedModel;
  systemPrompt: string;         // received, not built
  outputSchema?: OutputSchema;  // received, not built
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
  onChunk: StreamCallbacks['onChunk'];
  onMediaPart?: StreamCallbacks['onMediaPart'];
}) {
  const { messages, resolved, systemPrompt, outputSchema, webSearchEnabled, signal, onChunk, onMediaPart } = options;
  const adapter = getAdapter(getProviderType(resolved.provider));
  await adapter.chatStream(
    { messages, resolved, systemPrompt, webSearchEnabled, signal, outputSchema },
    { onChunk, onMediaPart }
  );
}
```

The service resolves the adapter and delegates. That's it. Prompt building moved to `buildChatRequest()`. Schema selection moved to `buildChatRequest()`. Model resolution moved to ChatContext (where it's needed for capability checking anyway).

This is a significant simplification of `unifiedAIService.ts`.

## Orchestrator Changes

### Current (`extensions/tool-orchestrator/index.ts`)

```typescript
import { CHAT_SYSTEM_PROMPT } from '@/services/unifiedAIService';  // direct coupling

export async function orchestrate(options, callbacks) {
  const effectiveSystemPrompt = systemPrompt || CHAT_SYSTEM_PROMPT(contextBlock, { hasTools: true });
  // ... builds own prompt ...
}
```

### New

```typescript
// No import from unifiedAIService

export async function orchestrate(options: OrchestratorOptions, callbacks: OrchestratorCallbacks) {
  // options.systemPrompt and options.outputSchema come from ChatRequestConfig
  // No prompt building here — just use what was given

  const streamOptions: ToolStreamOptions = {
    messages: buffer.getMessages(),
    resolved,
    systemPrompt: options.systemPrompt,    // from config
    outputSchema: options.outputSchema,     // from config
    webSearchEnabled: options.webSearchEnabled,
    signal: options.signal,
    tools: schemas,
    toolMessages: buffer.getToolMessages(),
  };

  await adapter.chatStreamWithTools(streamOptions, streamCallbacks);
}
```

The orchestrator is now purely an execution loop — it drives tool calling iterations and forwards options. It doesn't make prompt or schema decisions.

### OrchestratorOptions Type Update

```typescript
interface OrchestratorOptions {
  messages: ChatMessage[];
  systemPrompt: string;           // required — no longer optional with fallback
  outputSchema?: OutputSchema;    // NEW
  contextBlock?: string;
  settings: AppSettings;
  providers: ModelProvider[];
  historyItems: HistoryItem[];
  signal?: AbortSignal;
  webSearchEnabled?: boolean;
}
```

`systemPrompt` becomes required (was optional with fallback). The fallback was `CHAT_SYSTEM_PROMPT()` — that logic now lives in `buildChatRequest()` which always returns a prompt.

## State Persistence

No storage format changes. `suggestions` field on `ChatMessage` is already stored. We're only changing where suggestions come from (JSON vs delimiter), not how they're stored.

## Summary

| Layer | Before | After |
|-------|--------|-------|
| **Decision-making** | Scattered across unifiedAIService, orchestrator, ChatContext | Single `buildChatRequest()` call |
| **ChatContext** | Calls `unifiedAIService.chatStream()`, parses delimiters | Calls `buildChatRequest()`, creates extractor, passes config through |
| **Unified service** | Builds prompts, selects nothing, delegates | Receives prompt+schema, delegates |
| **Orchestrator** | Imports `CHAT_SYSTEM_PROMPT`, builds own prompt | Receives prompt+schema, runs tool loop |
| **Streaming store** | Receives raw chunks (including suggestions text) | Receives clean display text only |
| **Completion parsing** | `text.split('---SUGGESTIONS---')` | `JSON.parse(extractor.getFullJson())` |
| **Title generation** | Separate LLM call + 30 lines of regex | `parsed.title` from first response |

## File Changes

| File | Change | Complexity |
|------|--------|-----------|
| `src/shared/contexts/ChatContext.tsx` | Build config, create extractor, wrap handleChunk, JSON completion parsing, title from config | Medium |
| `services/unifiedAIService.ts` | Remove prompt building, receive systemPrompt+outputSchema as params | Medium (simplification) |
| `extensions/tool-orchestrator/index.ts` | Remove `CHAT_SYSTEM_PROMPT` import, receive systemPrompt+outputSchema from options | Low |
| `extensions/tool-orchestrator/types.ts` | Add `outputSchema?: OutputSchema` to `OrchestratorOptions`, make `systemPrompt` required | Low |
| UI components | **NO CHANGES** | — |
