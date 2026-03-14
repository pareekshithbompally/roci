# Phase 1 — Types & Utility Extraction

## 1.1 New types file: `message/types.ts`

The current `ChatMessageProps` interface has 20 flat props. Group related props into semantic objects so downstream components receive only what they need.

### Grouped Prop Interfaces

```ts
// message/types.ts

import type { ChatPart, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';

/** Citation-related props — consumed by ActionBar and SourcesList */
export interface CitationProps {
  meetingCitations?: MeetingCitation[];
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
  onCitationClick?: (citation: MeetingCitation) => void;
  onShowAllWebCitations?: (citations: WebCitation[]) => void;
}

/** Performance stats — consumed by ActionBar */
export interface StatsProps {
  tokenCount?: number;
  tokensPerSecond?: number;
}

/** Message actions — consumed by ActionBar and UserMessage */
export interface ActionProps {
  isCopied?: boolean;
  onCopy?: (id: string, text: string) => void;
  onRerun?: () => void;
}

/** Tool activity — consumed by ActionBar tooltip */
export interface ToolActivityData {
  calls: Array<{ toolName: string; executionMs: number; resultSummary?: string }>;
  totalIterations: number;
  citations?: MeetingCitation[];
}

/** Top-level ChatMessage props — the router interface */
export interface ChatMessageProps {
  id: string;
  role: 'user' | 'model' | 'assistant' | 'system';
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage?: boolean;
  provider?: string;
  model?: string;
  state?: 'loading' | 'streaming' | 'complete';
  toolActivity?: ToolActivityData;
  preparingTools?: boolean;
  actions: ActionProps;       // grouped
  stats: StatsProps;          // grouped
  citations: CitationProps;   // grouped
}
```

### Migration Note

The top-level `ChatMessageProps` changes shape: `isCopied`, `onCopy`, `onRerun` move into `actions`; `tokenCount`, `tokensPerSecond` move into `stats`; citation-related props move into `citations`.

**ChatView and ChatPanel must update** their `<ChatMessage>` call sites to pass grouped objects. This is done in Phase 5.

### Sub-Component Prop Interfaces

These are defined here but consumed by individual components:

```ts
/** UserMessage receives a subset */
export interface UserMessageProps {
  id: string;
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  actions: ActionProps;
}

/** AssistantMessage receives the rest */
export interface AssistantMessageProps {
  id: string;
  text: string;
  parts?: ChatPart[];
  timestamp?: number;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLastMessage: boolean;
  provider?: string;
  model?: string;
  state: 'loading' | 'streaming' | 'complete';
  toolActivity?: ToolActivityData;
  preparingTools: boolean;
  actions: ActionProps;
  stats: StatsProps;
  citations: CitationProps;
}
```

---

## 1.2 Utility extraction: `src/shared/utils/toolUtils.ts`

Move `friendlyToolName` out of the component file. It's a pure data transform with no React dependency.

### Current location
`ChatMessage.tsx:162-170`

### New file

```ts
// src/shared/utils/toolUtils.ts

/** Convert internal tool names to human-readable past-tense labels */
export function friendlyToolName(toolName: string): string {
  switch (toolName) {
    case 'search_meetings':   return 'Searched meetings';
    case 'get_meeting':       return 'Retrieved meeting';
    case 'list_meetings':     return 'Listed meetings';
    case 'get_action_items':  return 'Found action items';
    default: return toolName.replace(/_/g, ' ');
  }
}
```

### Consumers after extraction
- `AssistantActionBar.tsx` — tool tooltip text (was line 255 in ChatMessage.tsx)

### Note on ToolActivityIndicator

`ToolActivityIndicator.tsx` has its own `statusText()` function (line 19-29) with a **different** mapping — present tense ("Searching meetings...") vs past tense ("Searched meetings"). These are intentionally different (active vs completed). Do NOT merge them; they serve different UX states.

---

## 1.3 Checklist

- [ ] Create `src/features/chat/components/message/types.ts`
- [ ] Create `src/shared/utils/toolUtils.ts` with `friendlyToolName`
- [ ] Delete `friendlyToolName` from old `ChatMessage.tsx` (done in Phase 5)
- [ ] Verify `ToolActivityIndicator.tsx` is untouched (has its own status mapping)
