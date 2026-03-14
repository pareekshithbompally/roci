# Phase 3: ChatContext Accumulation & Storage

## Overview

The `ChatContext.tsx` sendMessage flow needs to:
1. Accumulate `webCitations` and `inlineCitations` from `StreamMetadata` during streaming
2. Attach them to the final `ChatMessage` alongside existing fields (`tokenCount`, `toolActivity`, etc.)
3. Persist them to disk via the existing `toStoredMessage`/`fromStoredMessage` conversion functions

---

## 3.1 — Accumulate Web Citations in `sendMessage()`

**File:** `src/shared/contexts/ChatContext.tsx`

### Add accumulator variables (after line 672)

Currently there are two accumulators:
```typescript
// Line 670: const completedToolCalls: Array<...> = [];
// Line 672: const allCitations: MeetingCitation[] = [];
```

Add web citation accumulators alongside them:

```typescript
// Accumulate web citations from StreamMetadata (deduplicated by URL)
const allWebCitations: WebCitation[] = [];
const allInlineCitations: InlineCitationSpan[] = [];
```

**Import:** Add `WebCitation` and `InlineCitationSpan` to the import from `@/types` (line 9):

```diff
-import type { ChatSession, ChatMessage, ChatPart, AppSettings, HistoryItem, MeetingCitation } from '@/types';
+import type { ChatSession, ChatMessage, ChatPart, AppSettings, HistoryItem, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';
```

### Extend the `handleChunk` callback (lines 607-636)

Currently `handleChunk` only forwards metadata to `aiActivity` state and pushes text to the streaming store. Add web citation accumulation:

```typescript
const handleChunk = (chunk: string, metadata?: {
  isThinking?: boolean;
  isSearching?: boolean;
  searchQuery?: string;
  thinkingContent?: string;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}) => {
  if (metadata) {
    // Accumulate web citations (deduplicate by URL)
    if (metadata.webCitations) {
      for (const citation of metadata.webCitations) {
        const existing = allWebCitations.findIndex(c => c.url === citation.url);
        if (existing === -1) {
          allWebCitations.push(citation);
        }
        // If duplicate URL, skip — keep first occurrence
      }
    }
    if (metadata.inlineCitations) {
      allInlineCitations.push(...metadata.inlineCitations);
    }

    // Forward thinking/searching state to UI (exclude citation fields)
    setState(prev => ({ ...prev, aiActivity: metadata }));
  }

  if (chunk) {
    // Transition from loading → streaming on first content chunk
    if (!hasFirstChunk) {
      hasFirstChunk = true;
      streamStartTime = Date.now();
      setState(prev => ({
        ...prev,
        aiActivity: null,
        sessions: prev.sessions.map(s => {
          if (s.id !== activeSessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, state: 'streaming' as const }
                : m
            ),
          };
        }),
      }));
    }

    streamingStore.push(chunk);
  }
};
```

### Attach to final message (lines 772-807)

In the `setState` call that transitions the message to `'complete'`, add the web citation fields:

```diff
 setState(prev => {
   const finalSessions = prev.sessions.map(s => {
     if (s.id !== activeSessionId) return s;
     return {
       ...s,
       messages: s.messages.map(m =>
         m.id === assistantMsgId
           ? {
               ...m,
               text: mainText,
               parts: finalParts.length > 0 ? finalParts : undefined,
               suggestions,
               state: 'complete' as const,
               tokenCount,
               tokensPerSecond,
               ...(completedToolCalls.length > 0 && {
                 toolActivity: {
                   calls: completedToolCalls,
                   totalIterations: completedToolCalls.length,
                   ...(allCitations.length > 0 && { citations: allCitations }),
                 },
               }),
+              ...(allWebCitations.length > 0 && {
+                webCitations: allWebCitations,
+              }),
+              ...(allInlineCitations.length > 0 && {
+                inlineCitations: allInlineCitations,
+              }),
             }
           : m
       ),
       lastMessageAt: Date.now(),
     };
   });
```

### Key behavior notes:

1. **Deduplication**: Web citations are deduplicated by URL during accumulation (keeps first occurrence). This handles the case where Gemini sends `groundingMetadata` on multiple chunks with overlapping sources.

2. **Inline citations pass through as-is**: We don't attempt to merge or deduplicate inline spans here — that's the injector's job at render time (Phase 5). The raw spans from the adapter are preserved.

3. **Empty arrays are omitted**: The spread-if pattern (`...(arr.length > 0 && { field: arr })`) ensures we don't pollute stored messages with empty arrays.

---

## 3.2 — Update Conversion Functions

**File:** `src/shared/contexts/ChatContext.tsx`

### `fromStoredMessage()` (lines 145-158)

Add the new fields:

```diff
 const fromStoredMessage = (msg: StoredChatMessage): ChatMessage => ({
   id: msg.id,
   role: msg.role === 'assistant' ? 'model' : 'user',
   text: msg.content,
   parts: msg.parts as ChatPart[] | undefined,
   timestamp: new Date(msg.timestamp).getTime(),
   provider: msg.provider,
   model: msg.model,
   suggestions: msg.suggestions,
   state: msg.role === 'assistant' ? 'complete' : undefined,
   tokenCount: msg.tokenCount,
   tokensPerSecond: msg.tokensPerSecond,
   toolActivity: msg.toolActivity,
+  webCitations: msg.webCitations,
+  inlineCitations: msg.inlineCitations,
 });
```

### `toStoredMessage()` (lines 161-173)

Add the new fields:

```diff
 const toStoredMessage = (msg: ChatMessage): StoredChatMessage => ({
   id: msg.id,
   role: msg.role === 'model' ? 'assistant' : 'user',
   content: msg.text,
   parts: msg.parts,
   timestamp: new Date(msg.timestamp).toISOString(),
   provider: msg.provider,
   model: msg.model,
   suggestions: msg.suggestions,
   tokenCount: msg.tokenCount,
   tokensPerSecond: msg.tokensPerSecond,
   toolActivity: msg.toolActivity,
+  webCitations: msg.webCitations,
+  inlineCitations: msg.inlineCitations,
 });
```

### Verification
- Load an existing chat session — no errors (new fields are `undefined`)
- Send a web-search-enabled message — new fields appear on the completed message
- Reload the app — web citations are restored from storage
- Inspect the stored JSON file to confirm `webCitations` and `inlineCitations` are persisted

---

## 3.3 — Backward Compatibility

### Existing messages without web citations

Both fields are optional (`?`). Messages stored before this feature will simply have `undefined` for both fields:
- `fromStoredMessage` returns `undefined` for missing properties
- UI components check for existence before rendering (Phase 4)
- No migration needed

### Interaction with `toolActivity.citations` (MeetingCitation)

The two citation systems are completely independent:
- `toolActivity.citations` = meeting citations from `search_meetings` tool calls
- `webCitations` = web citations from provider web search

Both can exist on the same message (if the model uses both web search AND meeting search tools). The Sources tab (Phase 4) will render both.

---

## 3.4 — Data Flow Summary

```
Adapter onChunk('', { webCitations: [...] })
    │
    ▼
handleChunk() in ChatContext.sendMessage()
    │  ┌── metadata.webCitations? → allWebCitations.push() (dedup by URL)
    │  └── metadata.inlineCitations? → allInlineCitations.push()
    │
    ▼
streamingStore.finish()  →  text, parts, etc.
    │
    ▼
setState: final message = {
    ...m,
    text: mainText,
    webCitations: allWebCitations,     ← NEW
    inlineCitations: allInlineCitations, ← NEW
    tokenCount,
    toolActivity,
    // ...
}
    │
    ▼
persistSession() → toStoredMessage() → disk
```

---

## Phase 3 Checklist

- [ ] Import `WebCitation`, `InlineCitationSpan` in ChatContext
- [ ] Add `allWebCitations`, `allInlineCitations` accumulators in `sendMessage()`
- [ ] Extend `handleChunk` to accumulate web citations from metadata
- [ ] Attach web citations to final message in the `setState` completion block
- [ ] Update `fromStoredMessage()` to read `webCitations` and `inlineCitations`
- [ ] Update `toStoredMessage()` to write `webCitations` and `inlineCitations`
- [ ] Verify backward compatibility with existing stored messages
- [ ] End-to-end: send web-search message → inspect stored JSON → reload → citations present
