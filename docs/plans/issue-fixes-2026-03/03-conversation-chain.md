# Phase 3: Fix Conversation Chain (Context Loss Across Turns)

> **Prerequisite:** Phase 2 (CORS/Tauri HTTP) is complete (commit `593aa09`). That phase injected `fetch:` into `getClient()` in `anthropic.adapter.ts`. This phase modifies `chatStreamWithTools()` in the same file — a different function, no conflict.

## Problem

Gemini models lose context across multiple turns in a single chat. Investigation reveals bugs across multiple providers, with Gemini being the worst affected.

## Root Causes

### Bug 1 (CRITICAL): `toGeminiHistory()` strips all media — text only

**File:** `services/adapters/message-converter.ts:129-133`

```typescript
export function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'model',
    parts: [{ text: m.text }],  // ← BUG: only text, media parts dropped
  }));
}
```

Every Gemini API call rebuilds history from scratch using this function. Prior turns' images, audio, video, and documents are silently stripped. The model sees `[Attached image: ...]` text stubs at best, or nothing at all.

**Contrast:** `toAnthropicMessages()` (line 153) and `toOpenAIMessages()` (line 195) both include multimodal parts via `hasMediaParts()` → `msg.parts!.map(converter)`. Gemini history does not.

### Bug 2 (HIGH): Anthropic `lastToolCalls` only tracks the most recent batch

**File:** `services/adapters/anthropic.adapter.ts:168-177`

```typescript
let lastToolCalls: ToolCall[] = [];
for (const tm of toolMessages) {
  if (tm.role === 'assistant_tool_call') {
    lastToolCalls = tm.toolCalls;  // ← overwrites on each iteration
    ...
  } else if (tm.role === 'tool_result') {
    const resultMsgs = toProviderToolResults(tm.results, lastToolCalls, 'anthropic');
    ...
  }
}
```

If the orchestrator runs 3 tool-call iterations, `lastToolCalls` only remembers iteration 3's calls. When iteration 1's results are paired with iteration 3's `tool_use_id` values, Anthropic rejects the request or silently drops context.

**Note:** This is partially mitigated because `toolMessages` are appended in order (call, result, call, result...), so `lastToolCalls` is updated *before* its corresponding result. But if the buffer ever has consecutive `assistant_tool_call` entries (possible if a tool call returns no results), the pairing breaks.

### Bug 3 (MEDIUM): Placeholder assistant message included in history

**File:** `src/shared/contexts/ChatContext.tsx:580-598`

When the user sends a message:
1. User message is added to `targetSession.messages` (line 542)
2. A placeholder assistant message with `state: 'loading'` and `text: ''` is added (line 596)
3. `targetSession.messages` (now including the empty placeholder) is passed to the adapter (lines 737, 797)

The empty assistant message gets converted to `{ role: 'assistant', content: '' }` and sent to providers. Most providers tolerate this, but:
- It wastes tokens on an empty turn
- Some providers may interpret it as the assistant choosing to say nothing
- Gemini's chat session treats it as a real model turn in history

### Bug 4 (MEDIUM): Tool call/result pairs not visible in subsequent turns

**File:** `extensions/tool-orchestrator/message-buffer.ts:13-16`

The `MessageBuffer` keeps `conversationMessages` read-only and accumulates `toolMessages` separately. After orchestration completes, only the final text response is persisted to the session (ChatContext line 865). The intermediate tool call/result pairs are discarded.

This means: if the user asks "what tools did you use?" in the next turn, the model has no record of tool usage in its history. More critically, if a tool returned data that influenced the response, that data is gone from context.

## Fixes

### Fix 1: Make `toGeminiHistory()` multimodal-aware

**File:** `services/adapters/message-converter.ts`

Replace lines 128-134:

```typescript
/** Convert messages into Gemini history with multimodal support. */
export function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'model',
    parts: hasMediaParts(m)
      ? m.parts!.map(chatPartToGeminiPart)
      : [{ text: m.text }],
  }));
}
```

This mirrors the pattern used by `toAnthropicMessages()` and `toOpenAIMessages()`. The `chatPartToGeminiPart()` function already exists (lines 17-36) and handles all media types correctly.

**Impact:** Fixes Gemini context loss for multimodal conversations. Text-only conversations are unaffected (same behavior as before).

### Fix 2: Track `lastToolCalls` per-result, not globally

**File:** `services/adapters/anthropic.adapter.ts`

The current code happens to work because tool messages alternate (call, result, call, result). But the variable name `lastToolCalls` is misleading and the pattern is fragile. Make it explicit:

```typescript
if (toolMessages?.length) {
  let pendingToolCalls: ToolCall[] = [];
  for (const tm of toolMessages) {
    if (tm.role === 'assistant_tool_call') {
      pendingToolCalls = tm.toolCalls;
      const assistantMsg = toProviderAssistantToolCall(tm.toolCalls, tm.textBefore, 'anthropic');
      if (assistantMsg) anthropicMessages.push(assistantMsg);
    } else if (tm.role === 'tool_result') {
      const resultMsgs = toProviderToolResults(tm.results, pendingToolCalls, 'anthropic');
      anthropicMessages.push(...resultMsgs);
      pendingToolCalls = [];  // ← clear after consumption
    }
  }
}
```

The key change is `pendingToolCalls = []` after consumption. This prevents stale tool call IDs from leaking into unrelated results if the message sequence is ever non-alternating.

### Fix 3: Filter out the placeholder assistant message before sending to adapters

**File:** `src/shared/contexts/ChatContext.tsx`

At line 737 (tool path) and line 797 (streaming path), `targetSession.messages` is passed directly to the adapter. This array includes the empty placeholder assistant message.

Add a filter before passing messages:

```typescript
// Filter out placeholder/loading messages before sending to provider
const messagesForProvider = targetSession.messages.filter(
  m => m.state !== 'loading' && m.state !== 'streaming'
);
```

Then pass `messagesForProvider` instead of `targetSession.messages` at both call sites (lines 737 and 797).

**Where to place this:** Just before the `if (useTools)` branch (around line 732), so it's computed once and used by both paths.

**Alternative approach:** Instead of filtering, simply don't add the placeholder to `targetSession.messages` at all — add it only to the UI state. But this is a larger refactor that changes how the streaming store associates messages with the session. The filter approach is safer and more surgical.

### Fix 4: Persist tool activity summary in message metadata (optional, lower priority)

This is the least critical fix. The tool call/result pairs are ephemeral by design (the `MessageBuffer` is documented as "discarded after orchestration completes"). The model's response already incorporates the tool results, so context isn't truly "lost" — it's just not available for explicit reference.

If you want to persist tool context for future turns, add a `toolContext` field to `ChatMessage`:

```typescript
interface ChatMessage {
  // ... existing fields
  toolActivity?: Array<{
    toolName: string;
    input: string;      // summarized input
    output: string;     // summarized output
  }>;
}
```

Then in `ChatContext.tsx` around line 865 where the final assistant message is built, attach the `completedToolCalls` array (already collected at line 724) as `toolActivity`.

The adapters would need to include this in the message content when building history. This is a larger change — defer unless users report the model "forgetting" tool results in follow-up turns.

## Verification

1. **Gemini multimodal test:** Start a chat with a Gemini model. Send an image in turn 1 with a question. In turn 2, ask a follow-up about the image *without re-sending it*. The model should remember the image.

2. **Gemini text-only test:** Multi-turn text conversation. Verify the model references earlier turns correctly (e.g., "As I mentioned earlier...").

3. **Anthropic tool test:** Enable tools. Ask a question that triggers multiple sequential tool calls. Verify no API errors about mismatched tool_use_ids.

4. **Placeholder filter test:** Add a `console.log` to the filter to verify the empty assistant message is being stripped. Check that the provider receives N-1 messages (no empty assistant turn).

5. **Cross-provider sanity:** Run a 5-turn conversation on each provider (Gemini, Anthropic, OpenAI, OpenAI-compat). Verify context is maintained by asking "what was my first message?" in the last turn.
