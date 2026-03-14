# Phase 2 — Orchestrator + Adapter Extensions

> Goal: Build the tool orchestration loop, extend all 4 adapters with tool calling support, wire into ChatContext. End-to-end tool calling works — verifiable via console logs and actual LLM responses. Basic UI feedback via existing `aiActivity` state.

---

## 2.1 Adapter Interface Extension

**File: `services/adapters/types.ts`**

### New Types

```typescript
/** Emitted by adapter when LLM requests a tool call */
interface ToolCallEvent {
  toolCalls: ToolCall[];          // One or more tool calls (parallel calling)
  textBefore?: string;            // Any text the LLM streamed before the tool call
}

/** Extended callbacks for tool-aware streaming */
interface ToolStreamCallbacks extends StreamCallbacks {
  onToolCall: (event: ToolCallEvent) => void;   // LLM wants to call a tool
}

/** Extended options that include tools */
interface ToolStreamOptions extends ChatStreamOptions {
  tools?: ToolSchema[];           // Available tool schemas
  toolMessages?: ToolMessage[];   // Previous tool call/result pairs in this turn
}

/** A message in the internal tool conversation buffer */
type ToolMessage =
  | { role: 'assistant_tool_call'; toolCalls: ToolCall[] }
  | { role: 'tool_result'; results: ToolResult[] };
```

### Extended Adapter Interface

Add ONE new optional method to `ILLMAdapter`:

```typescript
interface ILLMAdapter {
  // ... existing methods unchanged ...

  /** If the adapter supports tool calling, implement this. */
  chatStreamWithTools?(
    options: ToolStreamOptions,
    callbacks: ToolStreamCallbacks
  ): Promise<void>;
}
```

Optional method. Adapters that don't implement it → orchestrator knows tools aren't supported at the adapter level. This avoids breaking existing code.

---

## 2.2 Tool Schema Converter

**File: `services/adapters/tool-converter.ts`**

Converts the common `ToolSchema` format into each provider's native tool definition format. Also converts tool results back.

### Conversions Needed

**Schema (app → provider):**

| Provider | Format |
|----------|--------|
| Anthropic | `{ name, description, input_schema: JSONSchema }` |
| OpenAI (Responses) | `{ type: 'function', name, description, parameters: JSONSchema }` |
| Gemini | `{ functionDeclarations: [{ name, description, parameters: JSONSchema }] }` |
| OpenAI-Compat | `{ type: 'function', function: { name, description, parameters: JSONSchema } }` |

**Tool calls (provider → app):**

| Provider | Source Format | Conversion |
|----------|--------------|------------|
| Anthropic | `content_block { type: 'tool_use', id, name, input }` | `ToolCall { id, name, arguments: input }` |
| OpenAI | `response.output[{ type: 'function_call', call_id, name, arguments }]` | `ToolCall { id: call_id, name, arguments: JSON.parse(arguments) }` |
| Gemini | `part.functionCall { name, args }` | `ToolCall { id: generated, name, arguments: args }` |
| OpenAI-Compat | `delta.tool_calls[{ id, function: { name, arguments } }]` | `ToolCall { id, name, arguments: JSON.parse(arguments) }` |

**Tool results (app → provider):**

| Provider | Format |
|----------|--------|
| Anthropic | `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content, is_error }] }` |
| OpenAI | `{ type: 'function_call_output', call_id, output }` in next input |
| Gemini | `{ functionResponse: { name, response: { result } } }` as a part |
| OpenAI-Compat | `{ role: 'tool', tool_call_id, content }` as a message |

### Implementation

One file with exported functions per direction:

```
toProviderTools(schemas: ToolSchema[], providerType: ProviderType): any[]
parseToolCalls(response: any, providerType: ProviderType): ToolCall[]
toProviderToolResults(results: ToolResult[], providerType: ProviderType): any[]
```

Each function has a switch on `providerType`. Keeps all provider-specific formatting in one place.

---

## 2.3 Adapter Implementations

Each adapter gets `chatStreamWithTools()` added. The implementation follows the same pattern:

1. Convert tool schemas to provider format
2. Include tool messages (previous calls + results) in the conversation
3. Stream the response
4. Detect tool calls vs text in the stream
5. Emit `onToolCall` or `onChunk` accordingly

### Anthropic Adapter

**Key details:**
- Tools passed as top-level `tools` param in `messages.stream()`
- Tool calls arrive as `content_block_start` with `type: 'tool_use'`
- Tool call arguments stream via `content_block_delta` with `type: 'input_json_delta'`
- Need to accumulate argument JSON across deltas, parse on `content_block_stop`
- Text blocks (`type: 'text'`) stream normally via `onChunk`
- Tool results sent as `{ role: 'user', content: [{ type: 'tool_result', ... }] }`

**Streaming behavior:**
- Text blocks and tool_use blocks can coexist in one response
- Text before tool call → stream via `onChunk`
- Tool call detected → accumulate arguments → emit `onToolCall` on block stop
- If `stop_reason === 'tool_use'`: response ended because model wants to call tools
- If `stop_reason === 'end_turn'`: response is complete text

### OpenAI Adapter (Responses API)

**Key details:**
- Tools passed as `tools: [{ type: 'function', name, description, parameters }]`
- Tool calls arrive as output items with `type: 'function_call'`
- Arguments may stream or arrive complete depending on model
- Tool results sent as `{ type: 'function_call_output', call_id, output }` in next input
- Text arrives via `response.output_text.delta` (existing handler)

**Streaming behavior:**
- Monitor for `response.function_call_arguments.delta` events
- On `response.output_item.done` with function_call type → emit `onToolCall`
- Text and function calls can be in the same response

### Gemini Adapter

**Key details:**
- Tools declared as `tools: [{ functionDeclarations: [...] }]` in config
- Tool calls arrive as `functionCall` parts in the response
- Gemini does NOT stream function call arguments — they arrive complete
- Tool results sent as `functionResponse` parts in the next message
- Chat history must include function call + response pairs

**Streaming behavior:**
- Check each chunk for `functionCall` parts
- If found → emit `onToolCall`
- Text parts stream normally via `onChunk`

### OpenAI-Compat Adapter (llamacpp, etc.)

**Key details:**
- Tools passed as `tools: [{ type: 'function', function: { name, description, parameters } }]`
- Uses Chat Completions format (not Responses API)
- Tool calls arrive in `delta.tool_calls` array during streaming
- Arguments stream across multiple deltas — need to accumulate
- Tool results sent as `{ role: 'tool', tool_call_id, content }` messages
- **llamacpp server supports this** via its OpenAI-compatible endpoint (if the model supports tool calling)

**Streaming behavior:**
- Track `delta.tool_calls` across chunks
- Accumulate function name + arguments per tool call ID
- On stream end with `finish_reason === 'tool_calls'` → emit `onToolCall`
- Text deltas stream normally via `onChunk`

---

## 2.4 Tool Orchestrator

**File: `extensions/tool-orchestrator/index.ts`**

The core loop. Provider-agnostic. Talks to adapters via `ILLMAdapter.chatStreamWithTools()` and tools via `ToolExecutor`.

### Orchestrator Interface

```typescript
interface OrchestratorOptions {
  messages: ChatMessage[];           // Conversation history
  systemPrompt: string;              // Lean prompt (no RAG context)
  resolved: ResolvedModel;           // Model + provider config
  tools: ToolSchema[];               // From registry
  historyItems: HistoryItem[];       // For tool context
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
}

interface OrchestratorCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  onMediaPart?: (part: ChatPart) => void;
  onToolActivity: (activity: ToolActivity) => void;    // For UI indicators
}

interface ToolActivity {
  phase: 'calling' | 'executing' | 'result';
  toolName: string;
  iteration: number;
  totalIterations: number;           // max allowed
  detail?: string;                   // "Searching for 'database migration'..."
}
```

### The Loop

```
function orchestrate(options, callbacks, adapter):
  const MAX_ITERATIONS = 6
  const buffer = new MessageBuffer(options.messages)

  for iteration in 1..MAX_ITERATIONS:
    check signal.aborted → throw AbortError

    let pendingToolCalls: ToolCall[] = []

    await adapter.chatStreamWithTools(
      {
        messages: buffer.getMessages(),
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        toolMessages: buffer.getToolMessages(),
        resolved: options.resolved,
        webSearchEnabled: options.webSearchEnabled,
        signal: options.signal,
      },
      {
        onChunk: (text, meta) => callbacks.onChunk(text, meta),
        onMediaPart: callbacks.onMediaPart,
        onToolCall: (event) => {
          if (event.textBefore) callbacks.onChunk(event.textBefore)
          pendingToolCalls = event.toolCalls
        },
      }
    )

    // No tool calls → LLM gave a text response, we're done
    if pendingToolCalls.length === 0:
      return

    // Execute tools
    buffer.addAssistantToolCalls(pendingToolCalls)
    const results: ToolResult[] = []

    for call in pendingToolCalls:
      callbacks.onToolActivity({
        phase: 'executing',
        toolName: call.name,
        iteration,
        totalIterations: MAX_ITERATIONS,
        detail: formatToolDetail(call),
      })

      const result = await toolExecutor.execute(call, {
        historyItems: options.historyItems,
        signal: options.signal,
      })
      results.push(result)

      callbacks.onToolActivity({
        phase: 'result',
        toolName: call.name,
        iteration,
        totalIterations: MAX_ITERATIONS,
        detail: result.meta?.resultCount
          ? `Found ${result.meta.resultCount} results`
          : undefined,
      })

    buffer.addToolResults(results)
    // Loop continues — next iteration sends updated buffer to LLM

  // If we hit MAX_ITERATIONS, the last response (whatever it was) stands.
  // The LLM should have produced text by now.
```

### Key Behaviors

**Text before tool call**: If the LLM streams "Let me search your meetings for that..." before making a tool call, that text gets streamed to the UI normally. The user sees the model's reasoning.

**Parallel tool calls**: Some providers support multiple tool calls in one response. The orchestrator executes them sequentially (simpler, avoids race conditions with vectordb). Could parallelize later if needed.

**Max iterations guard**: Hard cap of 6 iterations. Prevents infinite loops if the model keeps calling tools without giving a text response. After 6, whatever the last response was gets committed.

**Abort during tool execution**: The signal is passed to `toolExecutor.execute()` → tools check it. If aborted mid-execution, the partial content already streamed is preserved.

---

## 2.5 Message Buffer

**File: `extensions/tool-orchestrator/message-buffer.ts`**

Manages the internal conversation state during a single tool-calling turn. This is ephemeral — not persisted to ChatContext.

### What It Holds

```
[...existing conversation messages]        ← from ChatContext
[user's new message]                       ← current turn
[assistant tool_call #1]                   ← from LLM response
[tool_result #1]                           ← from executor
[assistant tool_call #2]                   ← from next LLM response
[tool_result #2]                           ← from executor
...
```

### API

```
buffer.getMessages(): ChatMessage[]            // Original conversation for context
buffer.getToolMessages(): ToolMessage[]        // Tool call/result pairs for this turn
buffer.addAssistantToolCalls(calls: ToolCall[])
buffer.addToolResults(results: ToolResult[])
buffer.getToolCallHistory(): ToolCallRecord[]  // For metadata (stored on final message)
```

### Important: Adapters Handle the Full Conversion

The buffer stores tool messages in the common format. When the adapter receives `toolMessages`, it converts them to the provider's native format and appends them to the conversation. This conversion happens in the adapter's `chatStreamWithTools()`, using the converter from `tool-converter.ts`.

### What Gets Persisted

When the orchestrator loop completes, only the **final text response** is committed to ChatContext as the assistant message. The tool call/result pairs are NOT stored as separate messages.

However, the final `ChatMessage` gets metadata:

```typescript
// Extended ChatMessage (from Phase 3, but planned here)
{
  ...existingFields,
  toolActivity?: {
    calls: Array<{
      toolName: string;
      executionMs: number;
      resultSummary?: string;   // "Found 3 meetings"
    }>;
    totalIterations: number;
  };
}
```

This metadata is lightweight and lets the UI show "Used 3 tools" badges without storing full tool results.

---

## 2.6 ChatContext Integration

**File: `src/shared/contexts/ChatContext.tsx`**

### Changes to sendMessage()

The existing flow:

```
1. Create user message
2. Create assistant placeholder (state: 'loading')
3. Resolve context via contextPipeline
4. Start streaming via unifiedAIService.chatStream()
5. On complete: commit to ChatContext
```

The new flow:

```
1. Create user message
2. Create assistant placeholder (state: 'loading')
3. Resolve context via contextPipeline (only MentionProvider now)
4. Check: supportsTools(resolved)?
   YES → toolOrchestrator.orchestrate(
           messages, systemPrompt, tools, callbacks
         )
   NO  → unifiedAIService.chatStream(
           messages, systemPrompt, callbacks
           // NO contextBlock — clean prompt
         )
5. On complete: commit to ChatContext
```

### Key Change: System Prompt

When tools are enabled:
- System prompt is **lean**: `"You are Voxy, an intelligent AI assistant..."` + suggestion instructions
- NO context block injected
- The LLM gets tools instead of pre-loaded context

When tools are disabled:
- System prompt is lean too: same base prompt + suggestion instructions
- NO context stuffing (AgenticProvider removed)
- The model works with chat + attachments + @ mentions only

When @ mentions are present (regardless of tool support):
- MentionProvider still runs → context injected into system prompt
- Tools still available if enabled (LLM can search for additional context beyond what was mentioned)

### Streaming Store Integration

The orchestrator's `onChunk` callback feeds directly into `streamingStore.push()`. No change to the streaming architecture. The store doesn't know or care whether chunks come from direct streaming or tool-orchestrated streaming.

```typescript
// In sendMessage():
const onChunk = (chunk: string, metadata?: StreamMetadata) => {
  if (!hasFirstChunk) {
    hasFirstChunk = true;
    // Transition loading → streaming
    transitionToStreaming(assistantMsgId);
  }
  streamingStore.push(chunk);
};
```

### Tool Activity → aiActivity State

The orchestrator's `onToolActivity` callback maps to the existing `aiActivity` state:

```typescript
const onToolActivity = (activity: ToolActivity) => {
  setState(prev => ({
    ...prev,
    aiActivity: {
      isCallingTool: true,
      toolName: activity.toolName,
      toolPhase: activity.phase,
      toolDetail: activity.detail,
      toolIteration: activity.iteration,
    },
  }));
};
```

When the orchestrator loop completes (or on error), clear `aiActivity`:

```typescript
setState(prev => ({ ...prev, aiActivity: null }));
```

### State Machine Update

The message state machine gains nuance during tool calling:

```
LOADING
  ↓ (first text chunk)
STREAMING
  ↓ (tool call detected)
STREAMING + aiActivity.isCallingTool = true     ← text paused, tool executing
  ↓ (tool result fed back, LLM resumes)
STREAMING + aiActivity = null                    ← text flowing again
  ↓ (may repeat for multiple tool calls)
COMPLETE
```

The message `state` field itself doesn't change — it stays `'streaming'` throughout tool calling. The `aiActivity` provides supplementary information for the UI to show tool indicators.

---

## 2.7 Unified AI Service Changes

**File: `services/unifiedAIService.ts`**

### Minimal Changes

The `chatStream` method signature gets an optional `tools` parameter BUT the actual tool orchestration does NOT live here. The service remains a thin router.

New method:

```typescript
async chatStreamWithTools(
  messages: ChatMessage[],
  settings: AppSettings,
  providers: ModelProvider[],
  tools: ToolSchema[],
  callbacks: ToolStreamCallbacks,
  contextBlock?: string,
  webSearchEnabled?: boolean,
  signal?: AbortSignal,
): Promise<{ provider?: string; model?: string }> {
  const resolved = resolveModel(settings.chatModel, providers);
  const adapter = getAdapter(getProviderType(resolved.provider));
  const systemPrompt = CHAT_SYSTEM_PROMPT(contextBlock);

  if (!adapter.chatStreamWithTools) {
    throw new Error(`Provider ${resolved.provider} does not support tool calling`);
  }

  await adapter.chatStreamWithTools(
    { messages, resolved, systemPrompt, tools, webSearchEnabled, signal },
    callbacks
  );

  return { provider: resolved.provider, model: resolved.modelId };
}
```

The orchestrator calls this (not `chatStream`). But ChatContext decides which path to take.

---

## 2.8 Error Propagation

### Layers of Error Handling

```
Tool execution error
  → ToolExecutor catches, returns ToolResult { isError: true }
  → Orchestrator feeds error back to LLM as tool result
  → LLM responds gracefully ("I couldn't retrieve that information...")
  → User sees a helpful response, not a crash

Adapter/network error
  → chatStreamWithTools() throws
  → Orchestrator catches, checks if any text was already streamed
    YES → preserve partial text, add error note, transition to complete
    NO  → create error message, transition to complete
  → User sees partial response or error message

Abort (user hits stop)
  → AbortController.abort() fires
  → adapter.chatStreamWithTools() throws AbortError
  → Orchestrator checks signal.aborted, stops loop
  → Partial text preserved, transition to complete
  → User sees whatever was streamed so far

Max iterations reached
  → Orchestrator exits loop normally
  → Whatever text was last streamed becomes the response
  → Not an error — just a boundary
```

### Error in aiActivity

If a tool fails, the UI briefly shows the error before the LLM resumes:

```typescript
onToolActivity({
  phase: 'error',
  toolName: call.name,
  detail: "Couldn't search meetings",
})
```

This is transient — the next LLM response (even if it's "Sorry, I couldn't find that") clears the activity indicator.

---

## 2.9 Abort Handling

### During Different Phases

| Phase | Abort Behavior |
|-------|---------------|
| LLM streaming text | Stream stops, partial text preserved |
| LLM streaming tool call args | Tool call abandoned, partial text preserved |
| Tool executing | Executor checks signal, returns early if possible |
| Between iterations | Orchestrator checks signal before next iteration |

### Implementation

The existing `abortControllerRef` in ChatContext works as-is. The signal propagates through:

```
ChatContext.abortControllerRef.signal
  → orchestrator options.signal
    → adapter chatStreamWithTools options.signal
    → toolExecutor.execute context.signal
```

No new abort infrastructure needed.

---

## 2.10 Acceptance Criteria (Phase 2)

- [ ] "Hi" → LLM responds directly, no tools called (verify via console)
- [ ] "What was discussed about databases?" → LLM calls search_meetings, then get_meeting, then responds with grounded answer
- [ ] Multi-turn tool calls work (search → get details → synthesize)
- [ ] Abort during tool calling preserves partial content
- [ ] Tool execution errors don't crash the chat
- [ ] All 4 adapters handle tool call/result formatting correctly
- [ ] `aiActivity` state updates during tool calling (visible in React DevTools)
- [ ] @ mentions + tool calling coexist (context from mentions, tools for additional queries)
- [ ] Models with `toolsEnabled: false` go through clean direct path (no tools, no context stuffing)

---

## 2.11 Dependencies Map (Phase 2)

```
services/adapters/types.ts                ← extended with tool types
services/adapters/tool-converter.ts       ← NEW, depends on: types.ts, extensions/tools/types.ts
services/adapters/anthropic.adapter.ts    ← extended, depends on: tool-converter.ts
services/adapters/openai.adapter.ts       ← extended, depends on: tool-converter.ts
services/adapters/gemini.adapter.ts       ← extended, depends on: tool-converter.ts
services/adapters/openai-compat.adapter.ts← extended, depends on: tool-converter.ts
services/unifiedAIService.ts              ← new method, depends on: adapter types
extensions/tool-orchestrator/index.ts     ← NEW, depends on: tools/executor, adapter types
extensions/tool-orchestrator/types.ts     ← NEW, standalone
extensions/tool-orchestrator/message-buffer.ts ← NEW, depends on: types
src/shared/contexts/ChatContext.tsx        ← modified, depends on: orchestrator, modelResolver
```
