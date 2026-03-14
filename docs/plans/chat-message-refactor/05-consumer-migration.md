# Phase 5 — Consumer Migration & Cleanup

## 5.1 ChatView.tsx updates

### Current usage (lines 112-136)

```tsx
<ChatMessage
  key={message.id}
  id={message.id}
  role={message.role}
  text={message.text}
  parts={message.parts}
  timestamp={message.timestamp}
  suggestions={message.suggestions}
  isCopied={chat.copiedMessageId === message.id}
  onCopy={chat.copyMessage}
  onSuggestionClick={...}
  onRerun={...}
  isLastMessage={index === currentMessages.length - 1}
  provider={message.provider}
  model={message.model}
  state={message.state}
  tokenCount={message.tokenCount}
  tokensPerSecond={message.tokensPerSecond}
  toolActivity={message.toolActivity}
  preparingTools={message.state === 'loading' && !!chat.aiActivity?.isCallingTool}
  onCitationClick={handleCitationClick}
  webCitations={message.webCitations}
  inlineCitations={message.inlineCitations}
  onShowAllWebCitations={handleShowAllWebCitations}
/>
```

### New usage

```tsx
<ChatMessage
  key={message.id}
  id={message.id}
  role={message.role}
  text={message.text}
  parts={message.parts}
  timestamp={message.timestamp}
  suggestions={message.suggestions}
  onSuggestionClick={...}
  isLastMessage={index === currentMessages.length - 1}
  provider={message.provider}
  model={message.model}
  state={message.state}
  toolActivity={message.toolActivity}
  preparingTools={message.state === 'loading' && !!chat.aiActivity?.isCallingTool}
  actions={messageActions[message.id]}   // from useMemo map
  stats={messageStats[message.id]}       // from useMemo map
  citations={citationProps}              // single useMemo (same for all messages)
/>
```

### Stable grouped objects

To ensure memo works with reference comparison on grouped objects, we need stable references:

#### `actions` — per-message (depends on `isCopied` which differs per message)

```tsx
// Can't useMemo per-message in a .map() — use a helper
const getActions = useCallback((msgId: string): ActionProps => ({
  isCopied: chat.copiedMessageId === msgId,
  onCopy: chat.copyMessage,
  onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
}), [chat.copiedMessageId, chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);
```

**Problem:** This creates a new object on every call, defeating memo.

**Better approach:** `isCopied` changes for at most 1 message at a time. The memo comparator already handles this via reference change. The real question is: does the parent re-render cause all messages to get new action objects?

**Solution:** Keep `isCopied` as a top-level prop on ChatMessage (NOT in actions group). It changes per-message and is the primary trigger for individual re-renders.

Revised grouping:

```tsx
// These are stable across all messages — useMemo once
const messageActions = useMemo<ActionProps>(() => ({
  onCopy: chat.copyMessage,
  onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
}), [chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);
```

And `isCopied` stays flat:
```tsx
<ChatMessage
  ...
  isCopied={chat.copiedMessageId === message.id}
  actions={messageActions}
  ...
/>
```

#### `stats` — per-message but from message data (stable by reference)

Stats come from `message.tokenCount` and `message.tokensPerSecond` — these are properties of the stored message object. They only change on stream completion (once). No wrapping needed — just pass them directly:

```tsx
// Actually, stats can stay flat since they're message properties
// that rarely change and are primitive values
```

**Revised decision:** Keep `tokenCount` and `tokensPerSecond` as flat props. They're primitives that compare cheaply. Grouping primitives into an object just to compare by reference adds complexity for no gain.

#### `citations` — shared across all messages

```tsx
const citationProps = useMemo<CitationProps>(() => ({
  onCitationClick: handleCitationClick,
  onShowAllWebCitations: handleShowAllWebCitations,
}), [handleCitationClick, handleShowAllWebCitations]);
```

Per-message citation data (`webCitations`, `inlineCitations`, `meetingCitations`) comes from the message object and should stay as flat props — they're reference-stable (only set once on stream completion).

### Final revised approach

After working through the stability analysis, the optimal grouping is **lighter** than originally proposed:

```tsx
// ChatView.tsx
const sharedActions = useMemo(() => ({
  onCopy: chat.copyMessage,
  onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
}), [chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);

const citationHandlers = useMemo(() => ({
  onCitationClick: handleCitationClick,
  onShowAllWebCitations: handleShowAllWebCitations,
}), [handleCitationClick, handleShowAllWebCitations]);

// In the map:
<ChatMessage
  key={message.id}
  id={message.id}
  role={message.role}
  text={message.text}
  parts={message.parts}
  timestamp={message.timestamp}
  suggestions={message.suggestions}
  onSuggestionClick={handleSuggestionClick}
  isLastMessage={index === currentMessages.length - 1}
  provider={message.provider}
  model={message.model}
  state={message.state}
  tokenCount={message.tokenCount}
  tokensPerSecond={message.tokensPerSecond}
  toolActivity={message.toolActivity}
  preparingTools={message.state === 'loading' && !!chat.aiActivity?.isCallingTool}
  isCopied={chat.copiedMessageId === message.id}
  actions={sharedActions}
  citationHandlers={citationHandlers}
  webCitations={message.webCitations}
  inlineCitations={message.inlineCitations}
/>
```

This keeps per-message primitives flat (cheap to compare) and groups only the shared callback objects (stable via useMemo).

### Updated types to match

```ts
export interface ActionProps {
  onCopy?: (id: string, text: string) => void;
  onRerun?: () => void;
}

export interface CitationHandlers {
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
}
```

`isCopied` stays a flat boolean prop on `ChatMessageProps`.

---

## 5.2 ChatPanel.tsx updates

Same pattern as ChatView, except:
- No `onShowAllWebCitations` in `citationHandlers`
- `onRerun` is the same

```tsx
const citationHandlers = useMemo(() => ({
  onCitationClick: handleCitationClick,
  // no onShowAllWebCitations — web citations show inline only
}), [handleCitationClick]);
```

---

## 5.3 Import path updates

### Before
```ts
import { ChatMessage } from './ChatMessage';
// or
import { ChatMessage } from '@features/chat/components';
```

### After
```ts
import { ChatMessage } from './message';
// or (if barrel export in components/index.ts re-exports)
import { ChatMessage } from '@features/chat/components';
```

Update the `components/index.ts` barrel file to re-export from `message/`:
```ts
export { ChatMessage } from './message';
```

---

## 5.4 Old file cleanup

After all consumers are updated:

1. **Delete** `src/features/chat/components/ChatMessage.tsx` (the old monolith)
2. **Verify** no other imports reference the old path
3. **Verify** the barrel export in `components/index.ts` points to `./message`

---

## 5.5 Checklist

- [ ] Add `useMemo` for `sharedActions` in ChatView.tsx
- [ ] Add `useMemo` for `citationHandlers` in ChatView.tsx
- [ ] Update ChatView's `<ChatMessage>` callsite to new prop shape
- [ ] Add `useMemo` for `sharedActions` in ChatPanel.tsx
- [ ] Add `useMemo` for `citationHandlers` in ChatPanel.tsx (no onShowAllWebCitations)
- [ ] Update ChatPanel's `<ChatMessage>` callsite to new prop shape
- [ ] Update `components/index.ts` barrel export
- [ ] Delete old `ChatMessage.tsx`
- [ ] Search codebase for any remaining imports of old path
- [ ] Verify: `ChatHistoryList` or any other consumer doesn't import ChatMessage directly
