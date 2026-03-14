# Tool Orchestration Architecture — Overview

## Problem

The current RAG system auto-stuffs meeting context into every system prompt via the `AgenticProvider`. This causes:

1. Irrelevant context injection ("Hi" triggers full meeting data retrieval)
2. Small local models get overwhelmed by bloated system prompts
3. One-shot retrieval with no LLM input on what's actually needed
4. Wasted tokens/money on context the model never uses
5. No way for the LLM to do targeted, multi-step information gathering

## Solution

Replace context-stuffing with **LLM-driven tool calling**. The model decides if/when it needs meeting data, calls tools to retrieve it, and synthesizes a grounded response. For models that don't support tool calling, provide a clean fallback (chat + attachments, no auto-stuffing).

## Design Principles

1. **LLM decides** — No heuristic gates. The model chooses when to call tools.
2. **Lean core** — The adapter layer stays thin. Tool logic lives in extensions.
3. **Separation of concerns** — Tool definitions, tool execution, orchestration loop, and UI feedback are independent modules.
4. **No code duplication** — Provider-specific formatting handled by adapters. Orchestrator is provider-agnostic.
5. **Graceful degradation** — Models without tool support get a clean experience, not a broken one.
6. **Streaming integrity** — Tool activity indicators must NOT cause re-render storms. Use the existing `aiActivity` state + external streaming store pattern.

## Architecture

```
User sends message
       |
       v
ChatContext.sendMessage()
       |
       +-- MentionProvider (if @ mentions) --> context in system prompt
       |
       +-- supportsTools?
           |
     +-----+------+
     |             |
    YES            NO
     |             |
     v             v
ToolOrchestrator   adapter.chatStream() (clean, no RAG)
     |
     v
adapter.chatStreamWithTools(messages, tools, callbacks)
     |
     v
LLM streams response
     |
     +-- text only --> stream to UI, done
     |
     +-- tool_call detected --> pause text stream
           |
           v
     ToolExecutor.execute(toolCall)
       (vectordb search, meeting loader, etc.)
           |
           v
     Feed tool result back to LLM
           |
           v
     LLM continues (may call more tools or respond)
           |
     [max 6 iterations]
           |
           v
     Final text response --> stream to UI, commit to ChatContext
```

## File Structure

```
extensions/
  tools/                              <-- NEW: Tool definitions + executor
    types.ts                          Tool interfaces (ToolDefinition, ToolCall, ToolResult)
    registry.ts                       Collects tools, exports schemas
    executor.ts                       Runs tools by name, returns results
    definitions/
      search-meetings.tool.ts         Hybrid RAG search
      get-meeting.tool.ts             Load specific meeting fields
      list-meetings.tool.ts           Browse recent meetings
      get-action-items.tool.ts        Action items / todos

  tool-orchestrator/                  <-- NEW: Orchestration loop
    index.ts                          Main loop (send -> detect tool call -> execute -> repeat)
    types.ts                          Orchestrator interfaces
    message-buffer.ts                 Internal conversation buffer (ephemeral)

  context-pipeline/                   <-- SIMPLIFIED
    index.ts                          Only MentionProvider remains
    providers/
      mention.provider.ts             Unchanged
      agentic.provider.ts             REMOVED (replaced by tool calling)

services/
  adapters/
    types.ts                          Extended with ToolStreamCallbacks, ToolCallEvent
    anthropic.adapter.ts              + tool formatting (tool_use / tool_result blocks)
    openai.adapter.ts                 + tool formatting (Responses API tools)
    gemini.adapter.ts                 + tool formatting (functionCall / functionResponse)
    openai-compat.adapter.ts          + tool formatting (Chat Completions function_call)
    tool-converter.ts                 NEW: Common tool schema -> provider-specific format

src/
  features/chat/
    components/
      ChatMessage.tsx                 Extended with tool activity display
      ToolActivityIndicator.tsx       NEW: "Searching meetings..." progress
    stores/
      streamingStore.ts               Unchanged (tool orchestrator feeds into this)

  features/settings/
    components/
      ModelSettingsModal.tsx           NEW: Per-model settings (tools toggle)
      ProvidersPanel.tsx              + gear icon per model

  shared/
    contexts/
      ChatContext.tsx                  + tool orchestrator integration
    utils/
      modelResolver.ts               + supportsTools() helper

types/
  modelProviders.ts                   Model type extended with settings
```

## What Stays

| Component | Reason |
|-----------|--------|
| sqlite-vec / vectordb plugin | Solid. Tools wrap this. |
| RAG indexer / chunker / searcher | Tools call into these. |
| MentionProvider | Explicit user intent. Separate path. |
| Streaming store | Orchestrator feeds into it. Zero changes. |
| Adapter abstraction (ILLMAdapter) | Extended, not replaced. |
| meetingReferenceService | Tools call into it. |
| Message converter | Extended for tool messages. |

## What Goes

| Component | Replacement |
|-----------|-------------|
| AgenticProvider | LLM tool calling |
| CHAT_SYSTEM_PROMPT context injection | Lean system prompt (no RAG) |
| Score-threshold filtering | LLM decides relevance |
| Context pipeline running RAG on every message | Tools invoked on demand |

## Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| 1 — Foundation | Types, tool registry, executor, model config | Tools testable in isolation |
| 2 — Engine | Orchestrator, adapter extensions, ChatContext wiring | End-to-end tool calling works (console-verifiable) |
| 3 — UI | Settings modal, chat indicators, animations | Full user-facing experience |
| 4 — Cleanup & Hardening | Remove AgenticProvider, fallbacks, edge cases, polish | Production-ready |
