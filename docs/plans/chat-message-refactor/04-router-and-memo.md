# Phase 4 — Router & Memoization Strategy

## 4.1 ChatMessage Router — `message/ChatMessage.tsx`

### Purpose

Thin component that receives all props, determines the role, and renders either `UserMessage` or `AssistantMessage`. No rendering logic of its own.

### Implementation

```tsx
// message/ChatMessage.tsx
import { memo } from 'react';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import type { ChatMessageProps } from './types';

export const ChatMessage: React.FC<ChatMessageProps> = memo(({
  id, role, text, parts, timestamp, suggestions, onSuggestionClick,
  isLastMessage = false, provider, model,
  state = 'complete', toolActivity, preparingTools = false,
  actions, stats, citations,
}) => {
  const isUser = role === 'user';

  if (isUser) {
    return <UserMessage id={id} text={text} parts={parts} timestamp={timestamp} actions={actions} />;
  }

  return (
    <AssistantMessage
      id={id} text={text} parts={parts} timestamp={timestamp}
      suggestions={suggestions} onSuggestionClick={onSuggestionClick}
      isLastMessage={isLastMessage ?? false} provider={provider} model={model}
      state={state ?? 'complete'} toolActivity={toolActivity}
      preparingTools={preparingTools ?? false}
      actions={actions} stats={stats} citations={citations}
    />
  );
});

ChatMessage.displayName = 'ChatMessage';
export default ChatMessage;
```

### Estimated size: ~30 lines

---

## 4.2 Memoization Strategy

### Current problems with the custom comparator

The existing `areEqual` function (ChatMessage.tsx:470-486) has these issues:

1. **Missing fields**: `suggestions`, `tokensPerSecond`, `onCopy`, `onRerun`, `provider`, `model`, `timestamp` are not compared — changes to these silently swallowed.
2. **Redundant checks**: Compares both `toolActivity` and `toolActivity?.citations` — if the parent reference didn't change, the child can't change either.
3. **Callback instability risk**: Compares `onCitationClick` and `onShowAllWebCitations` by reference. If parent doesn't stabilize with `useCallback`, memo breaks. Both ChatView and ChatPanel DO use `useCallback` for these, so this works today but is fragile.

### New strategy: Streaming short-circuit + default shallow compare

```ts
memo(Component, (prev, next) => {
  // State change always triggers re-render
  if (prev.state !== next.state) return false;
  // During streaming, only StreamingContent re-renders (via useSyncExternalStore)
  // The outer ChatMessage doesn't need to — its props haven't changed
  if (next.state === 'streaming') return true;
  // For all other states, use default shallow comparison
  // This is correct because:
  // - Primitive props (text, id, state) compared by value
  // - Grouped objects (actions, stats, citations) compared by reference
  //   → Parents must stabilize these with useMemo (see Phase 5)
  return undefined; // Fall through to React's default shallow compare
});
```

**Wait — `React.memo`'s custom comparator doesn't support `undefined` as "fall through".** The function must return `true` (skip render) or `false` (re-render).

### Revised approach: keep explicit shallow compare, but cover ALL fields

```ts
memo(Component, (prev, next) => {
  if (prev.state !== next.state) return false;
  if (next.state === 'streaming') return true;
  return (
    prev.id === next.id &&
    prev.text === next.text &&
    prev.parts === next.parts &&
    prev.isLastMessage === next.isLastMessage &&
    prev.suggestions === next.suggestions &&
    prev.preparingTools === next.preparingTools &&
    prev.toolActivity === next.toolActivity &&
    prev.actions === next.actions &&        // reference compare — stable via useMemo
    prev.stats === next.stats &&            // reference compare — stable via useMemo
    prev.citations === next.citations       // reference compare — stable via useMemo
  );
});
```

### Why this works

With grouped props:
- `actions`, `stats`, `citations` are **objects** → single reference comparison each
- Parents wrap them in `useMemo` with appropriate deps (see Phase 5)
- No more 15+ individual comparisons, no more missing fields
- The streaming short-circuit stays — only `StreamingContent` (via `useSyncExternalStore`) re-renders during streaming

### Memoization at sub-component level

| Component | Memo? | Reason |
|-----------|-------|--------|
| `ChatMessage` | `memo` with custom comparator | Streaming short-circuit |
| `UserMessage` | plain `memo()` | Simple props, shallow compare sufficient |
| `AssistantMessage` | plain `memo()` | Grouped props already stable from parent |
| `AssistantActionBar` | plain `memo()` | Only renders on complete state, props don't change often |
| `StreamingContent` | `memo` (existing) | Inner isolation for streaming chunks |
| `SuggestionsList` | none | Rendered conditionally, tiny, always fresh |
| `SourcesList` | none | Rendered conditionally, tiny, always fresh |
| `PartsList` | none | Called by StreamingContent (already isolated) or CompletedContent (only on state change) |

---

## 4.3 Index file — `message/index.ts`

```ts
// message/index.ts
export { ChatMessage } from './ChatMessage';
export type { ChatMessageProps, ActionProps, StatsProps, CitationProps } from './types';
```

Only `ChatMessage` and the type interfaces are public. Internal components (`UserMessage`, `AssistantMessage`, `AssistantActionBar`, etc.) are implementation details.

---

## 4.4 Checklist

- [ ] Create `message/ChatMessage.tsx` — thin router
- [ ] Implement revised memo comparator covering all grouped props
- [ ] Create `message/index.ts` — public exports only
- [ ] Verify: streaming state → no parent re-render (only StreamingContent)
- [ ] Verify: state transition loading→streaming→complete triggers re-render correctly
- [ ] Verify: prop changes in complete state (isCopied toggle, suggestions arrival) trigger re-render
