# Phase 4 — Cleanup, Fallbacks, Edge Cases, Hardening

> Goal: Remove the old AgenticProvider, simplify the context pipeline, handle all edge cases, ensure graceful degradation, and make the system production-ready.

---

## 4.1 Remove AgenticProvider

### Files to Modify

**Delete:**
- `extensions/context-pipeline/providers/agentic.provider.ts`

**Modify:**
- `extensions/context-pipeline/index.ts` — Remove AgenticProvider registration. Pipeline now only has MentionProvider.

```
// Before:
export const contextPipeline = new ContextPipeline()
  .register(new MentionProvider())
  .register(new AgenticProvider());

// After:
export const contextPipeline = new ContextPipeline()
  .register(new MentionProvider());
```

### Why Not Keep It as Fallback?

The AgenticProvider was the source of the original problem — blind context stuffing. For models without tool support, the correct fallback is NO context injection (clean chat + attachments + @ mentions). Keeping AgenticProvider "just in case" perpetuates the problem.

If a user wants meeting context with a non-tool model, they use @ mentions. Explicit is better than magic.

---

## 4.2 Context Pipeline Simplification

### Simplified Flow

```
contextPipeline.resolve(input):
  - MentionProvider.shouldRun() → true if @ mentions present
    → Load mentioned meetings, format for LLM
    → Return with confidence 1.0
  - No @ mentions → return empty string
```

The pipeline infrastructure (priority-based, fail-open) stays intact. If future context providers are needed (e.g., calendar integration, document search), they plug in cleanly. We're just removing the one provider that caused problems.

### System Prompt Cleanup

**File: `services/unifiedAIService.ts`**

The `CHAT_SYSTEM_PROMPT` function stays, but context injection only happens for @ mentions:

```
When tools enabled:
  systemPrompt = basePrompt + mentionContext (if any) + suggestionsInstruction

When tools disabled:
  systemPrompt = basePrompt + mentionContext (if any) + suggestionsInstruction
```

Same in both paths. The difference is: tool-enabled models also get tool schemas. Non-tool models just get the lean prompt.

---

## 4.3 Fallback Path (Non-Tool Models)

### Behavior

When `supportsTools(resolved) === false`:

1. Context pipeline runs (MentionProvider only — @ mentions if present)
2. System prompt = lean base + any mention context + suggestions
3. Direct `adapter.chatStream()` — no tools, no orchestrator
4. Normal streaming → complete

The user gets a competent chat assistant that can reference @ mentioned meetings. It just can't proactively search for information.

### User Guidance

When a user sends a message that seems to need meeting context but the model doesn't have tools:

The model won't know about meetings (no context injected). It will respond based on its training data only. This is correct behavior — the user chose not to enable tools.

If the user asks "What did we discuss?" and gets a generic answer, they'll learn to either:
- Enable tools for that model
- Use @ mentions to provide context
- Switch to a model with tools enabled

No special "hey, you should enable tools" prompting from the app. That would be patronizing. The tools badge in ChatInput is sufficient — if it's not there, the user knows.

---

## 4.4 Edge Cases

### 4.4.1 Model Returns Tool Call But Tools Are Disabled

Shouldn't happen (tools aren't sent in the request). But if it does (some models hallucinate tool calls):
- Adapter doesn't parse tool calls (using regular `chatStream`, not `chatStreamWithTools`)
- The tool call JSON appears as text in the response
- Ugly but harmless. The user sees garbage and learns to disable tools for that model.

### 4.4.2 Model Calls a Tool That Doesn't Exist

Orchestrator receives a `ToolCall` with unknown name:
- `toolExecutor.execute()` returns `ToolResult { isError: true, content: "Unknown tool: {name}" }`
- Fed back to LLM
- LLM typically adjusts (calls a valid tool or responds without it)

### 4.4.3 Model Calls Same Tool in Infinite Loop

Max iterations guard (6) stops this. After 6 iterations, the orchestrator exits. Whatever text was last streamed becomes the response.

### 4.4.4 Tool Returns Very Large Result

Some meetings have huge transcripts. If `get_meeting` returns 50k characters of transcript:

**Option A (recommended for now):** Truncate tool results at a reasonable limit (e.g., 8000 chars) with a note: `"[Truncated — showing first 8000 chars of transcript]"`. The LLM can ask for a specific section if needed.

**Option B (future):** Token budget tracking. Count approximate tokens across all tool results in the buffer. When approaching a threshold (based on model's context window), truncate or summarize older results.

Implement Option A in Phase 4. It's simple and handles the 90% case.

### 4.4.5 No Meetings Indexed

If the user has no meetings (empty `historyItems`):
- `search_meetings` returns "No meetings found. The user hasn't recorded any meetings yet."
- `list_meetings` returns same
- `get_meeting` returns "Meeting not found"
- LLM responds accordingly: "It looks like you haven't recorded any meetings yet..."

Tool context has `historyItems` — tools check this. No special handling needed.

### 4.4.6 VectorDB Not Initialized

If sqlite-vec fails to initialize (corrupt DB, missing extension, etc.):
- `search_meetings` tool catches the error → `ToolResult { isError: true, content: "Search unavailable: {error}" }`
- LLM receives the error, responds: "I'm having trouble searching your meetings right now..."
- Not a crash. The chat continues.

### 4.4.7 @ Mentions + Tool Calling Together

User @ mentions Meeting A, then asks "How does this compare to other discussions on this topic?"

Flow:
1. MentionProvider loads Meeting A into system prompt context
2. Orchestrator sends to LLM with tools + Meeting A context in system prompt
3. LLM sees Meeting A in context, calls `search_meetings("topic from meeting A")` to find related meetings
4. Gets results, maybe calls `get_meeting` for details
5. Synthesizes comparison

This works naturally. The system prompt context (from @ mentions) and tool results are complementary.

### 4.4.8 Abort During First Iteration (No Text Streamed Yet)

User sends message, model immediately calls a tool (no text first), user hits stop during tool execution:

1. Signal fires
2. Tool execution aborted (if it respects the signal)
3. Orchestrator catches AbortError
4. No text was streamed → message transitions to 'complete' with empty text
5. Effectively: the message disappears or shows as empty

**Better behavior**: If no text was streamed, remove the assistant message entirely (as if the user never sent the message). Or show: "[Stopped]" as the message text.

Handle this in ChatContext's error handler — check if `hasFirstChunk` is false when abort happens.

### 4.4.9 Provider Doesn't Support chatStreamWithTools

Even if `supportsTools(resolved) === true` (user enabled it), the adapter might not implement `chatStreamWithTools()`. This could happen if:
- A new provider is added without tool support
- A bug in adapter registration

**Guard**: In ChatContext, check both `supportsTools(resolved)` AND `adapter.chatStreamWithTools` exists:

```
const useTools = supportsTools(resolved) && adapter.chatStreamWithTools != null;
```

If the adapter doesn't support it, fall back to direct `chatStream()` silently. Log a warning for debugging.

### 4.4.10 Streaming Text Interleaved With Tool Calls

Some models output text, then a tool call, then more text after the tool result, then another tool call. The orchestrator handles this naturally:

Iteration 1:
- LLM streams: "Let me check that for you." + tool_call(search_meetings)
- "Let me check that for you." → streamed to UI via onChunk
- Tool executes, result fed back

Iteration 2:
- LLM streams: "I found 3 relevant meetings. Let me get the details." + tool_call(get_meeting)
- New text → streamed to UI (appends to existing)
- Tool executes, result fed back

Iteration 3:
- LLM streams: "Here's what I found: [synthesis]"
- No tool call → done

The streaming store accumulates all text across iterations. The user sees a continuous, growing response with tool activity indicators between text segments.

---

## 4.5 Tool Result Truncation

**Implementation in `extensions/tools/executor.ts`**

```
const MAX_TOOL_RESULT_CHARS = 8000;

// After tool execution, before returning:
if (result.content.length > MAX_TOOL_RESULT_CHARS) {
  result.content = result.content.slice(0, MAX_TOOL_RESULT_CHARS)
    + '\n\n[Result truncated. Ask for specific sections if you need more detail.]';
}
```

This applies to all tools uniformly. The LLM sees the truncation note and can request specific sections via `get_meeting` with targeted fields.

---

## 4.6 Logging & Debugging

### Console Logging

Add structured logs for the tool calling pipeline (gated behind a debug flag or always-on in dev):

```
[ToolOrchestrator] Starting turn with 4 tools available
[ToolOrchestrator] Iteration 1: sending to LLM
[ToolOrchestrator] LLM called tool: search_meetings({query: "database migration"})
[ToolExecutor] Executing search_meetings (query="database migration", limit=5)
[ToolExecutor] search_meetings completed in 45ms, 3 results
[ToolOrchestrator] Feeding 3 tool results back to LLM
[ToolOrchestrator] Iteration 2: sending to LLM
[ToolOrchestrator] LLM responded with text (no tool calls). Done in 2 iterations.
```

### Dev Tools

The existing `aiActivity` state is inspectable via React DevTools. The `toolActivity` metadata on completed messages is inspectable in the persisted chat JSON.

---

## 4.7 Performance Considerations

### Token Usage

Tool calling adds overhead:
- Tool schemas in every request (~200-400 tokens for 4 tools)
- Tool call/result pairs in multi-turn (~variable, depends on results)
- Multiple LLM calls per user message

For remote models: This means higher API costs per message. But the results are significantly better than blind context stuffing (which also uses tokens, often wastefully).

For local models: Each iteration means another inference pass. On a 4B model, this could be 5-10 seconds per iteration. A 3-iteration tool call turn = 15-30 seconds. This is acceptable if the result is good.

### VectorDB Performance

The existing hybrid search is fast (~50-100ms). Tool execution latency is dominated by:
1. Meeting data loading from disk (meetingReferenceService)
2. LLM inference time

Not a bottleneck.

### Memory

Tool results in the message buffer are ephemeral — garbage collected after the turn completes. The `toolActivity` metadata on the final message is tiny (~100 bytes). No memory concerns.

---

## 4.8 Migration Path

### Existing Chats

Old chat sessions (persisted as JSON) don't have `toolActivity` on messages. This is fine — the field is optional. Old messages render without the tool badge. No migration needed.

### Existing Model Configs

Old model configs don't have `toolsEnabled`. The field is optional, defaults to `undefined` which is treated as `false`. No migration needed.

Remote models in `consts/providers.ts` should get `toolsEnabled: true` added to their definitions. This means after the update, remote models automatically get tool support. Users who want to disable it can do so in the modal.

### Existing Settings

No settings schema changes. The `Model` type gains an optional field. Existing persisted settings are forward-compatible.

---

## 4.9 Suggestions Instruction Consideration

The system prompt currently includes instructions for `---SUGGESTIONS---` formatting. With tool calling, the LLM might not follow this instruction reliably if it's focused on tool interactions.

**Keep it**: The instruction stays in the system prompt. After the tool calling loop completes and the LLM gives its final text response, it should still include suggestions. If it doesn't (some models forget after multi-turn tool calls), the UI gracefully handles it (no suggestions shown, no crash).

**Don't change the instruction format** for tool-enabled models. It works for single-turn responses and usually works for multi-turn too. Not worth adding complexity.

---

## 4.10 Future Extensibility

### Adding New Tools

Drop a new file in `extensions/tools/definitions/`, export a `ToolDefinition`, register in `extensions/tools/index.ts`. The orchestrator, adapters, and UI all work automatically.

Potential future tools:
- `search_notes(query)` — search only across meeting notes (more targeted than full search)
- `get_calendar(date_range)` — if calendar integration is added
- `create_todo(title, due_date)` — if the LLM should be able to create action items
- `web_search(query)` — wrap the existing web search as a tool (unify the toggle with tool calling)

### Provider-Specific Tool Features

Some providers have unique tool-calling features:
- **Anthropic**: Tool use with caching (`cache_control` on tool results)
- **OpenAI**: Parallel tool calls, strict mode for schemas
- **Gemini**: Code execution tool, Google Search as a tool

These can be added per-adapter without changing the orchestrator. The adapter just uses provider-specific features when formatting tool schemas/results.

### MCP Server (Future)

If you later want to expose tools via MCP (for external clients or multi-app scenarios):
- The tool registry and executor are already abstracted from the LLM layer
- Wrap them in an MCP server that translates MCP protocol → tool registry calls
- The LLM adapters could connect to MCP instead of the in-process executor
- Or both: in-process for speed, MCP for external access

The current architecture doesn't prevent this. The separation between tool definitions and LLM integration makes it straightforward.

---

## 4.11 Full Acceptance Criteria (End-to-End)

### Happy Path

- [ ] "Hi" → clean response, no tools called, no meeting data
- [ ] "What did we discuss about databases?" → tools called, meetings found, grounded answer
- [ ] "How did opinions change across meetings?" → multi-turn tool calls, cross-meeting synthesis
- [ ] "Explain quantum computing" → no tools called, general knowledge response
- [ ] @ mention a meeting + ask question → mention context in prompt + tools available for follow-up
- [ ] @ mention + no tools → mention context only, no tool calls

### Model Variations

- [ ] Remote model (Gemini/Claude/GPT) with tools enabled → full tool calling
- [ ] Remote model with tools disabled → clean chat, no context stuffing
- [ ] Local model (llamacpp) with tools enabled → tool calling works (if model supports it)
- [ ] Local model with tools disabled → clean chat, no context stuffing
- [ ] OpenAI-compat (Groq, OpenRouter) with tools → tool calling via Chat Completions format

### Error Handling

- [ ] Tool execution fails → LLM gets error, responds gracefully
- [ ] Network error during LLM call → error message in chat, not a crash
- [ ] Abort during tool execution → partial content preserved
- [ ] Abort before any text → message removed or shows "[Stopped]"
- [ ] Max iterations reached → last response stands
- [ ] VectorDB not initialized → tool returns error, LLM responds

### UI

- [ ] Tool activity indicator shows during tool calls
- [ ] Indicator phases (calling → executing → result) transition smoothly
- [ ] No animation jank during streaming
- [ ] Tool badge on completed messages that used tools
- [ ] Tools badge in ChatInput for tool-enabled models
- [ ] Per-model settings modal works, toggle persists
- [ ] Dark mode for all new elements
- [ ] No re-render regressions (React Profiler clean)

### Data Integrity

- [ ] Tool activity metadata persists in chat JSON
- [ ] Old chats load correctly (no toolActivity = no badge, no crash)
- [ ] Model settings persist across app restarts
- [ ] No data loss on abort during tool calling

---

## 4.12 Files Summary (All Phases)

### New Files
| File | Phase |
|------|-------|
| `extensions/tools/types.ts` | 1 |
| `extensions/tools/registry.ts` | 1 |
| `extensions/tools/executor.ts` | 1 |
| `extensions/tools/index.ts` | 1 |
| `extensions/tools/definitions/search-meetings.tool.ts` | 1 |
| `extensions/tools/definitions/get-meeting.tool.ts` | 1 |
| `extensions/tools/definitions/list-meetings.tool.ts` | 1 |
| `extensions/tools/definitions/get-action-items.tool.ts` | 1 |
| `extensions/tool-orchestrator/index.ts` | 2 |
| `extensions/tool-orchestrator/types.ts` | 2 |
| `extensions/tool-orchestrator/message-buffer.ts` | 2 |
| `services/adapters/tool-converter.ts` | 2 |
| `src/features/settings/components/ModelSettingsModal.tsx` | 3 |
| `src/features/chat/components/ToolActivityIndicator.tsx` | 3 |
| `src/styles/tool-activity.css` | 3 |

### Modified Files
| File | Phase | Change |
|------|-------|--------|
| `types/modelProviders.ts` | 1 | Add `toolsEnabled` to Model |
| `src/shared/utils/modelResolver.ts` | 1 | Add `supportsTools()` helper |
| `consts/providers.ts` | 1 | Set `toolsEnabled: true` on remote models |
| `services/adapters/types.ts` | 2 | Add tool-related interfaces |
| `services/adapters/anthropic.adapter.ts` | 2 | Add `chatStreamWithTools()` |
| `services/adapters/openai.adapter.ts` | 2 | Add `chatStreamWithTools()` |
| `services/adapters/gemini.adapter.ts` | 2 | Add `chatStreamWithTools()` |
| `services/adapters/openai-compat.adapter.ts` | 2 | Add `chatStreamWithTools()` |
| `services/unifiedAIService.ts` | 2 | Add `chatStreamWithTools()` method |
| `src/shared/contexts/ChatContext.tsx` | 2 | Orchestrator integration, aiActivity extension |
| `src/features/settings/components/ProvidersPanel.tsx` | 3 | Gear icon, modal integration |
| `src/features/chat/components/ChatMessage.tsx` | 3 | Indicator, badge, memo update |
| `src/features/chat/components/ChatInput.tsx` | 3 | Tools badge |
| `types.ts` | 3 | Add `toolActivity` to ChatMessage |

### Deleted Files
| File | Phase |
|------|-------|
| `extensions/context-pipeline/providers/agentic.provider.ts` | 4 |

### Modified in Cleanup
| File | Phase | Change |
|------|-------|--------|
| `extensions/context-pipeline/index.ts` | 4 | Remove AgenticProvider registration |
| `extensions/tools/executor.ts` | 4 | Add result truncation |
