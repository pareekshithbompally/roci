# ChatMessage Refactor — Overview

## Goal

Decompose the 490-line monolithic `ChatMessage.tsx` into a composition of small, focused components with clear boundaries, single responsibilities, and independent testability — while preserving the streaming isolation pattern and visual behavior exactly as-is.

## Current State

**`ChatMessage.tsx`** does everything:
- Role routing (user vs assistant) — two unrelated layouts in one component
- State management (loading/streaming/complete)
- Action bar with tabbed suggestions/sources panel (~160 lines)
- Tool activity tooltip
- Inline citation injection
- Media part rendering delegation
- Custom memo comparator (fragile, missing fields)
- `friendlyToolName` utility function

**Consumers:** `ChatView.tsx` and `ChatPanel.tsx` — both pass identical prop shapes, differing only in `onShowAllWebCitations` (ChatPanel omits it).

## Target State

```
src/features/chat/components/message/
├── index.ts                    # Re-exports ChatMessage
├── ChatMessage.tsx             # Thin router: picks UserMessage or AssistantMessage
├── UserMessage.tsx             # Bubble + copy + timestamp + media attachments
├── AssistantMessage.tsx        # Header + tool indicator + content + action bar
├── AssistantActionBar.tsx      # Copy/rerun/stats + tab switcher
├── SuggestionsList.tsx         # Suggestion rows
├── SourcesList.tsx             # Meeting + web citation rows
├── PartsList.tsx               # Shared text/media part iteration
├── ActionButton.tsx            # Reusable icon button
└── types.ts                    # Shared interfaces (grouped prop objects)
```

Plus one utility extraction:
```
src/shared/utils/toolUtils.ts   # friendlyToolName (+ future tool display helpers)
```

## Phases

| Phase | Document | Scope |
|-------|----------|-------|
| 1 | [01-types-and-utils.md](./01-types-and-utils.md) | New types, prop grouping, utility extraction |
| 2 | [02-leaf-components.md](./02-leaf-components.md) | ActionButton, PartsList, SuggestionsList, SourcesList |
| 3 | [03-message-components.md](./03-message-components.md) | UserMessage, AssistantMessage, AssistantActionBar |
| 4 | [04-router-and-memo.md](./04-router-and-memo.md) | ChatMessage router, memo strategy, streaming isolation |
| 5 | [05-consumer-migration.md](./05-consumer-migration.md) | ChatView/ChatPanel updates, old file cleanup |
| 6 | [06-sentinel-cleanup.md](./06-sentinel-cleanup.md) | Remove `---SUGGESTIONS---` from StreamingContent |

## Principles

1. **Zero visual change** — no CSS, spacing, or behavior differences after refactor
2. **Streaming isolation preserved** — `StreamingContent` + `useSyncExternalStore` stays exactly as-is
3. **No new abstractions beyond what's needed** — we're splitting, not redesigning
4. **Each file 60–130 lines** — if it's longer, it's doing too much
5. **Imports stay clean** — consumers import from `message/index.ts`, internals stay private
6. **Existing tests (if any) must pass** — we're restructuring, not rewriting logic

## What This Refactor Does NOT Do

- Change the streaming store architecture
- Modify ChatContext or the data flow
- Redesign the citation system
- Add new features or functionality
- Touch StreamingMarkdown, MediaPartRenderer, ToolActivityIndicator, or any drawer
