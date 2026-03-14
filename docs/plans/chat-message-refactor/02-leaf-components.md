# Phase 2 — Leaf Components

These are small, self-contained components with no children of their own (except what they render from props). Each is independently testable and reusable.

---

## 2.1 ActionButton — `message/ActionButton.tsx`

### Source
Currently defined inline at `ChatMessage.tsx:92-109`.

### Extraction
Lift verbatim into its own file. No logic changes.

```ts
// message/ActionButton.tsx
interface ActionButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}
```

### Consumers
- `AssistantActionBar.tsx` — copy, rerun buttons
- `UserMessage.tsx` — copy button (currently uses raw `<button>`, should switch to ActionButton for consistency)

### Estimated size: ~20 lines

---

## 2.2 PartsList — `message/PartsList.tsx`

### Problem
Both `StreamingContent` (line 74-86) and `CompletedContent` (line 127-149) iterate over `parts` with the same pattern:
```
parts.map → text? render StreamingMarkdown : render MediaPartRenderer
```

The only differences:
1. `streaming` prop (true vs false)
2. Completed text runs through `injectCitationTokens()` + passes `webCitations` to StreamingMarkdown
3. Streaming text strips `---SUGGESTIONS---` (to be removed in Phase 6)

### Design

```ts
// message/PartsList.tsx
interface PartsListProps {
  parts: ChatPart[];
  messageId: string;
  streaming: boolean;
  /** Optional: transforms text before rendering (e.g. citation injection) */
  processText?: (text: string) => string;
  /** Passed to StreamingMarkdown for inline citation rendering */
  webCitations?: WebCitation[];
}
```

Logic:
1. Iterate `parts`
2. For `type === 'text'`: apply `processText` if provided, render `StreamingMarkdown` with `streaming` prop and optional `webCitations`
3. For other types: render `MediaPartRenderer`
4. Skip empty text parts

### What stays outside PartsList
- The `useMemo` for `processedText` in CompletedContent — that's the caller's concern
- The `useStreamingText()` hook — stays in StreamingContent (which calls PartsList)
- The suggestion sentinel strip — stays in StreamingContent until Phase 6 removes it

### Estimated size: ~35 lines

---

## 2.3 SuggestionsList — `message/SuggestionsList.tsx`

### Source
Currently embedded in `ActionBarWithTabs` at lines 280-285.

### Design

```ts
// message/SuggestionsList.tsx
interface SuggestionsListProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}
```

Renders the list of suggestion buttons with arrow prefix, `line-clamp-1`, and staggered animation delay.

### Styling
Uses the `rowClass` currently defined at line 213. This class string is shared with meeting citations. Extract it as a constant in a shared location (either a `message/styles.ts` constants file, or inline in each component since it's a single string).

**Decision: inline in each component.** The string is short and the two usages differ slightly (suggestions use `cursor-pointer`, sources may get different hover states later). Duplicating a one-line Tailwind string is better than a premature abstraction.

### Estimated size: ~25 lines

---

## 2.4 SourcesList — `message/SourcesList.tsx`

### Source
Currently embedded in `ActionBarWithTabs` at lines 286-326.

### Design

```ts
// message/SourcesList.tsx
interface SourcesListProps {
  meetingCitations?: MeetingCitation[];
  webCitations?: WebCitation[];
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
}
```

Contains:
1. **Meeting citation rows**: Mic icon + title + date — clickable
2. **Web citation rows**: Favicon + title/domain — external link
3. **"+N more" button**: Only renders when `onShowAllWebCitations` is provided and `webCitations.length > MAX_VISIBLE_WEB`

### Constants
- `MAX_VISIBLE_WEB = 3` — stays in this file (it's a presentation concern)
- `sourceRowClass` — inline in this file (only used here)

### Dependencies
- `getFaviconUrl`, `extractDomain` from `@shared/utils/citationUtils`
- `Mic` from `lucide-react`

### Estimated size: ~65 lines

---

## 2.5 Checklist

- [ ] Create `message/ActionButton.tsx` — lift from ChatMessage.tsx:92-109
- [ ] Create `message/PartsList.tsx` — unify parts iteration from StreamingContent + CompletedContent
- [ ] Create `message/SuggestionsList.tsx` — extract from ActionBarWithTabs:280-285
- [ ] Create `message/SourcesList.tsx` — extract from ActionBarWithTabs:286-326
- [ ] Verify all leaf components have zero state (stateless presentational)
- [ ] Verify no circular imports between leaf components
