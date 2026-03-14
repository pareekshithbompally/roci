# Phase 3 — Message Components

These are the mid-level components that compose the leaf components from Phase 2.

---

## 3.1 UserMessage — `message/UserMessage.tsx`

### Source
Currently the `isUser` branch of ChatMessage: lines 430-467.

### Props

```ts
// Uses UserMessageProps from message/types.ts
interface UserMessageProps {
  id: string;
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  actions: ActionProps;  // { isCopied, onCopy }
}
```

### What it renders
1. Right-aligned bubble with `ACCENT.userBubble` + `ACCENT.userText`
2. Text content with scrollable overflow (`max-h-[40vh]`)
3. Media attachments (non-text parts) via `MediaPartRenderer`
4. Copy button on hover (absolute positioned, `-bottom-1 -left-8`)
5. Timestamp below bubble

### Changes from current
- **None functionally.** Exact same JSX, just in its own file.
- Receives `actions.onCopy` and `actions.isCopied` instead of flat props.
- Does NOT receive any assistant-only props (toolActivity, citations, state, etc.).

### Notes
- Consider using `ActionButton` for the copy button to match assistant side. Currently it's a raw `<button>`. However, the user-side copy has different positioning/opacity behavior (`opacity-0 group-hover:opacity-100`). Keep the raw button for now — unifying this is a future concern.

### Estimated size: ~50 lines

---

## 3.2 AssistantActionBar — `message/AssistantActionBar.tsx`

### Source
Currently `ActionBarWithTabs`: lines 173-332 (~160 lines).

### Props

```ts
interface AssistantActionBarProps {
  id: string;
  text: string;
  timestamp?: number;
  isLastMessage: boolean;
  actions: ActionProps;
  stats: StatsProps;
  toolActivity?: ToolActivityData;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  citations: CitationProps;
}
```

**Prop count: 10** (down from 15+ flat props). The three grouped objects (`actions`, `stats`, `citations`) collapse 9 props into 3 objects.

### What it renders
1. **Separator** — `border-t` divider
2. **Action bar row**:
   - Left: tab switcher (`Suggestions` / `Sources`) — only if there's content
   - Right: stats display (`tok/s · tok`), tool tooltip (wrench icon), rerun button, copy button, timestamp
3. **Tab content** — delegates to `SuggestionsList` or `SourcesList`

### State
- `activeTab: 'suggestions' | 'sources'` — local state for tab selection

### Fix: Stale activeTab initialization

The current code initializes `activeTab` based on props at mount time. If suggestions arrive after mount, the tab won't flip.

**Fix:** Add a `useEffect` to auto-switch to 'suggestions' tab when `hasSuggestions` transitions from false to true:

```ts
useEffect(() => {
  if (hasSuggestions) setActiveTab('suggestions');
}, [hasSuggestions]);
```

This is safe because `ActionBarWithTabs` only mounts when `state === 'complete'`, but the defensive fix makes it resilient to future changes.

### Tool tooltip
The wrench icon + hover popup stays inline here. It's 8 lines of JSX — not worth a separate component.

### Dependencies
- `ActionButton` (Phase 2)
- `SuggestionsList` (Phase 2)
- `SourcesList` (Phase 2)
- `friendlyToolName` from `@shared/utils/toolUtils` (Phase 1)
- Icons: `Copy`, `Check`, `RefreshCw`, `Gauge`, `Wrench` from `lucide-react`

### Estimated size: ~100 lines (down from ~160 by extracting SuggestionsList and SourcesList)

---

## 3.3 AssistantMessage — `message/AssistantMessage.tsx`

### Source
The `isAssistant` branch of ChatMessage: lines 367-427, plus `StreamingContent` (lines 68-89) and `CompletedContent` (lines 112-160).

### Props

```ts
// Uses AssistantMessageProps from message/types.ts
```

### What it renders
1. **Provider/Model header** — `AnimatedProviderIcon` + provider title + model name
   - Loading state: contextual text ("Loading model...", "Preparing tools...", "Working on it...")
   - Streaming/complete: provider title + model
2. **ToolActivityIndicator** — for loading/streaming states (self-hiding)
3. **Content area** — `StreamingContent` or `CompletedContent` (see below)
4. **AssistantActionBar** — only when `state === 'complete' && text`

### StreamingContent (stays as inner component)

`StreamingContent` is a `memo`'d inner component that subscribes to `useSyncExternalStore`. This isolation is critical — it prevents the entire chat list from re-rendering on each streaming chunk.

**It stays inside `AssistantMessage.tsx`** as a file-scoped component. Moving it to its own file would work but adds an import for zero benefit — it's only used here and its isolation comes from the `useSyncExternalStore` hook, not file boundaries.

Changes:
- Uses `PartsList` (Phase 2) instead of inline parts iteration
- Suggestion sentinel strip moves upstream (Phase 6)

### CompletedContent (stays as inner component)

Same reasoning — small, single-use, tightly coupled to AssistantMessage. Stays in-file.

Changes:
- Uses `PartsList` (Phase 2) instead of inline parts iteration
- Citation injection logic (`injectCitationTokens`) stays here as the `processText` callback passed to `PartsList`

### Estimated size: ~110 lines (StreamingContent ~15, CompletedContent ~30, AssistantMessage ~65)

---

## 3.4 Checklist

- [ ] Create `message/UserMessage.tsx` — from ChatMessage isUser branch
- [ ] Create `message/AssistantActionBar.tsx` — from ActionBarWithTabs
  - [ ] Fix stale activeTab with useEffect
  - [ ] Use grouped props (actions, stats, citations)
  - [ ] Delegate to SuggestionsList and SourcesList
- [ ] Create `message/AssistantMessage.tsx` — from ChatMessage isAssistant branch
  - [ ] Keep StreamingContent as inner component
  - [ ] Keep CompletedContent as inner component
  - [ ] Use PartsList for shared iteration
- [ ] Verify streaming isolation: only StreamingContent subscribes to store
- [ ] Verify no visual changes in any state (loading, streaming, complete)
