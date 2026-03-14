# Phase 2 — Adapter Layer Changes

## Objective

Extend the adapter interface so any adapter can receive an optional output schema. Each provider adapter maps the schema to its native structured output parameter. The interface is provider-agnostic — no provider-specific requirements leak upward.

## Interface Changes

### New Type: `OutputSchema` (from `src/core/ai/types.ts`, defined in Phase 1)

```typescript
interface OutputSchema {
  name?: string;                       // Optional — only OpenAI requires it
  schema: Record<string, unknown>;     // Standard JSON Schema object
}
```

`name` is optional. This is critical — it means the shared interface doesn't force every consumer to provide an OpenAI-specific field. Each adapter handles it:

| Adapter | What it does with `name` |
|---------|-------------------------|
| **OpenAI** | Uses `name` if provided, otherwise defaults to `'response'` |
| **Anthropic** | Ignores `name` — API doesn't require it |
| **Gemini** | Ignores `name` — API doesn't require it |
| **OpenAI-Compat** | Uses `name` if provided, otherwise defaults to `'response'` |

### Updated Options — Add `outputSchema?`

```typescript
interface ChatStreamOptions {
  messages: ChatMessage[];
  resolved: ResolvedModel;
  systemPrompt: string;
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
  outputSchema?: OutputSchema;         // NEW
}

interface ChatOptions {
  messages: ChatMessage[];
  resolved: ResolvedModel;
  systemPrompt: string;
  outputSchema?: OutputSchema;         // NEW
}

interface DocumentOptions {
  file: File;
  resolved: ResolvedModel;
  prompt: string;
  outputSchema?: OutputSchema;         // NEW
}

// ToolStreamOptions extends ChatStreamOptions → inherits outputSchema automatically.
```

### ILLMAdapter — No Change

The adapter interface contract doesn't change. The schema flows through the options objects. Adapters that support it read `options.outputSchema`; adapters that don't, ignore it. Backward-compatible.

## Per-Adapter Implementation

### OpenAI Adapter (`openai.adapter.ts`)

**chatStream — Responses API:**
```typescript
const runner = client.responses.stream({
  model: resolved.modelId,
  input,
  ...(tools.length > 0 && { tools }),
  ...(outputSchema && {
    text: {
      format: {
        type: 'json_schema',
        name: outputSchema.name || 'response',  // default if not provided
        schema: outputSchema.schema,
        strict: true,
      },
    },
  }),
});
```

**chat — Responses API (non-streaming):**
```typescript
const response = await (client.responses as any).create({
  model: resolved.modelId,
  input,
  ...(outputSchema && {
    text: {
      format: {
        type: 'json_schema',
        name: outputSchema.name || 'response',
        schema: outputSchema.schema,
        strict: true,
      },
    },
  }),
});
```

**processDocument — Chat Completions API:**
```typescript
const response = await client.chat.completions.create({
  model: resolved.modelId,
  messages: [...],
  ...(outputSchema && {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: outputSchema.name || 'response',
        schema: outputSchema.schema,
        strict: true,
      },
    },
  }),
});
```

Note: `processDocument` uses Chat Completions (not Responses API). Different syntax for the same concept.

**Compatibility**: `text.format` coexists with `tools: [{ type: 'web_search_preview' }]` and function calling tools.

### Anthropic Adapter (`anthropic.adapter.ts`)

**chatStream:**
```typescript
const stream = client.messages.stream({
  model: resolved.modelId,
  system: systemPrompt,
  messages: anthropicMessages,
  max_tokens: maxTokens,
  ...(thinkingEnabled && { thinking: { ... } }),
  ...(tools.length > 0 && { tools }),
  ...(outputSchema && {
    output_config: {
      format: {
        type: 'json_schema',
        schema: outputSchema.schema,
        // name is intentionally not passed — Anthropic doesn't use it
      },
    },
  }),
});
```

**Compatibility**: Works alongside `tools` and `thinking` parameters.

### Gemini Adapter (`gemini.adapter.ts`)

**chatStream:**
```typescript
const stream = await chat.sendMessageStream({
  message: parts,
  config: {
    ...(config.tools && { tools: config.tools }),
    ...(outputSchema && {
      responseMimeType: 'application/json',
      responseJsonSchema: outputSchema.schema,
    }),
  },
});
```

**Compatibility**: Per Gemini docs, structured output works with Google Search grounding and function calling simultaneously.

**IMPORTANT — Tool Loop Timing (Gemini-Specific)**:

Gemini's adapter runs its own internal tool loop (lines 262-315 of `gemini.adapter.ts`). It calls `chat.sendMessageStream()` multiple times within a single `chatStreamWithTools()` invocation. The schema is set at the **session level** (`ai.chats.create({ config })`) and applies to ALL responses in the session.

This means:
- Pass 0 (user message): Model may respond with text OR `functionCall` parts
- Pass 1-N (tool results): Model may respond with text OR more `functionCall` parts
- Final pass: Model responds with text only (no function calls)

Per Gemini's docs, structured output constrains text output only — `functionCall` parts are unaffected by `responseJsonSchema`. So applying the schema at session creation is correct. The model can still emit function calls freely; only its text responses are JSON-constrained.

**If this doesn't work in practice**: The fallback is to NOT pass `responseJsonSchema` at session creation, and instead create a second chat session (without tools, with schema) for the final text response after the tool loop completes. This is more complex and should only be implemented if testing reveals conflicts. Document this as a contingency, not the default approach.

### OpenAI-Compat Adapter (`openai-compat.adapter.ts`)

**chatStream — Chat Completions API:**
```typescript
const runner = client.chat.completions.stream({
  model: resolved.modelId,
  messages: openAIMessages,
  ...(tools.length > 0 && { tools }),
  ...(outputSchema && {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: outputSchema.name || 'response',
        schema: outputSchema.schema,
        strict: true,
      },
    },
  }),
});
```

**Caveat**: OpenAI-compat backends (llama.cpp, vLLM, Ollama) have varying support. Many modern backends support `response_format`, but some don't.

**Error handling**: If the backend rejects `response_format`, the adapter should catch the error. But this is a rare edge case — `buildChatRequest()` already gates on `supportsStructuredOutput` from model capabilities. If the capability flag says false, no schema is ever passed. The adapter doesn't need its own fallback logic.

## Tool Orchestrator — Schema Passthrough

The orchestrator (`extensions/tool-orchestrator/index.ts`) currently imports `CHAT_SYSTEM_PROMPT` directly from `unifiedAIService`. This coupling is eliminated.

**Current (problematic):**
```typescript
import { CHAT_SYSTEM_PROMPT } from '@/services/unifiedAIService';
// orchestrator builds its own prompt
const effectiveSystemPrompt = systemPrompt || CHAT_SYSTEM_PROMPT(contextBlock, { hasTools: true });
```

**New:**
```typescript
import { buildChatRequest } from '@/core/ai';
// orchestrator receives ChatRequestConfig or builds one via the same function
```

The orchestrator has two paths:

**Path A — Config passed in from unified service:**
The unified service calls `buildChatRequest()`, gets a `ChatRequestConfig`, and passes its fields (systemPrompt, outputSchema) through `OrchestratorOptions`. The orchestrator just forwards them to the adapter. No decision-making.

**Path B — Orchestrator builds config itself (if called directly):**
If orchestrator is ever called outside the unified service, it calls `buildChatRequest()` itself. Same function, same result.

Either way, there is ONE function making the prompt+schema decision.

**Schema in the tool loop:**

For orchestrator-driven adapters (Anthropic, OpenAI), the orchestrator passes `outputSchema` in `streamOptions` on every iteration:

```typescript
const streamOptions: ToolStreamOptions = {
  messages: buffer.getMessages(),
  resolved,
  systemPrompt: config.systemPrompt,
  webSearchEnabled,
  signal,
  tools: schemas,
  toolMessages: buffer.getToolMessages(),
  outputSchema: config.outputSchema,  // passed every iteration
};
```

This is correct because:
- All three providers constrain text output only — tool calls are unaffected by the schema
- On iterations where the model returns tool calls (no text), the schema has no effect
- On the final iteration where the model returns text, the schema constrains it to the expected JSON shape

## Summary of Changes Per File

| File | Change |
|------|--------|
| `services/adapters/types.ts` | Import `OutputSchema` from `@/core/ai/types`, add `outputSchema?` to `ChatStreamOptions`, `ChatOptions`, `DocumentOptions` |
| `services/adapters/openai.adapter.ts` | Read `outputSchema`, map to `text.format` (Responses) or `response_format` (Completions). Default `name` to `'response'` if not provided. |
| `services/adapters/anthropic.adapter.ts` | Read `outputSchema`, map to `output_config.format`. Ignore `name`. |
| `services/adapters/gemini.adapter.ts` | Read `outputSchema`, map to `responseMimeType` + `responseJsonSchema`. Ignore `name`. Apply at session level. |
| `services/adapters/openai-compat.adapter.ts` | Read `outputSchema`, map to `response_format`. Default `name` to `'response'`. |
| `extensions/tool-orchestrator/index.ts` | Remove `import { CHAT_SYSTEM_PROMPT }`. Receive or build `ChatRequestConfig`. Pass `outputSchema` through `streamOptions`. |

## Testing Strategy

Each adapter tested in isolation before integration:

1. **Structured chat**: Call `adapter.chat()` with schema → verify response is valid JSON matching schema
2. **Structured streaming**: Call `adapter.chatStream()` with schema → verify accumulated chunks form valid JSON
3. **Structured + web search**: Call with `outputSchema` + `webSearchEnabled: true` → verify coexistence
4. **Structured + tools (Anthropic/OpenAI)**: Call `chatStreamWithTools()` with schema + tools → verify tool calls work, final text is JSON
5. **Structured + tools (Gemini)**: Same test but verifying Gemini's internal loop handles schema correctly — model can emit `functionCall` parts despite `responseJsonSchema`
6. **No schema**: Call without `outputSchema` → verify existing behavior unchanged
7. **Name defaulting (OpenAI)**: Call with `outputSchema: { schema: {...} }` (no name) → verify adapter defaults to `'response'`
