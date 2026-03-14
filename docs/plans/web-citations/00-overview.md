# Web Search Citations — Architecture Overview

## Problem

Web search is toggleable (Globe button) and all 3 providers return rich citation data:

| Provider | Citation Shape |
|----------|---------------|
| **Gemini** | `groundingMetadata.groundingChunks` (URL + title) and `groundingSupports` (inline text→source mappings) |
| **Anthropic** | `web_search_tool_result` content blocks with `source.url`, `source.title`, `page_content` |
| **OpenAI** | `url_citation` annotations on output text items via `finalResponse()` |

**All citation data is currently discarded.** The adapters extract `isSearching` / `searchQuery` metadata for the loading indicator, but never capture the actual source URLs, titles, or inline mappings.

## Goal

End-to-end citation extraction, storage, and display — without disrupting the existing `MeetingCitation` system.

## Unified Types

Two new interfaces in `services/adapters/types.ts`, separate from `MeetingCitation`:

```typescript
interface WebCitation {
  url: string;
  title: string;
  snippet?: string;       // short excerpt from the source page
}

interface InlineCitationSpan {
  startIndex: number;     // char offset into the completed text
  endIndex: number;       // char offset end
  sourceIndices: number[]; // indexes into the webCitations[] array
}
```

These are deliberately distinct from `MeetingCitation` (which has `meetingId`, `excerpt`, `score`, etc.). Web citations reference external URLs; meeting citations reference internal recordings.

## Data Flow

```
┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐    ┌──────────────┐
│ Provider SDK  │───>│ Adapter extracts │───>│ StreamMetadata    │───>│ ChatContext   │
│ (Gemini/etc.) │    │ WebCitation[]    │    │ .webCitations     │    │ accumulates   │
└──────────────┘    └──────────────────┘    │ .inlineCitations  │    │ on final msg  │
                                            └───────────────────┘    └──────┬───────┘
                                                                            │
                                    ┌───────────────────────────────────────┘
                                    │
                              ┌─────▼─────────┐    ┌─────────────────┐
                              │ ChatMessage    │───>│ Persisted to    │
                              │ .webCitations  │    │ disk (storage)  │
                              │ .inlineCitations│    └─────────────────┘
                              └─────┬──────────┘
                                    │
                          ┌─────────┴──────────────────────┐
                          │                                │
                    ┌─────▼──────┐               ┌────────▼──────────┐
                    │ Sources tab │               │ Inline markers    │
                    │ (favicon +  │               │ (superscript      │
                    │  title row) │               │  [1][2] badges)   │
                    └─────┬──────┘               └───────────────────┘
                          │
                    ┌─────▼──────────────┐
                    │ WebCitationDrawer  │
                    │ (slide-in panel)    │
                    └────────────────────┘
```

## Files Modified (14 files, 4 new)

### Types & Utils (Phase 1)
| File | Change |
|------|--------|
| `services/adapters/types.ts` | Add `WebCitation`, `InlineCitationSpan`; extend `StreamMetadata` |
| `types.ts` | Add `webCitations?`, `inlineCitations?` to `ChatMessage` |
| `services/storage/types.ts` | Passthrough — `toolActivity` import already covers, but `webCitations`/`inlineCitations` need explicit fields |
| `src/shared/utils/citationUtils.ts` | **NEW** — favicon URL helper, domain extraction, deduplication |

### Adapters (Phase 2)
| File | Change |
|------|--------|
| `services/adapters/gemini.adapter.ts` | Parse `groundingChunks` + `groundingSupports` from final chunk |
| `services/adapters/anthropic.adapter.ts` | Capture `web_search_tool_result` blocks from stream events |
| `services/adapters/openai.adapter.ts` | Read `url_citation` annotations from `finalResponse()` |

### Data Flow (Phase 3)
| File | Change |
|------|--------|
| `src/shared/contexts/ChatContext.tsx` | Accumulate web citations from `StreamMetadata`, attach to final message |

### UI (Phases 4-6)
| File | Change |
|------|--------|
| `src/features/chat/components/ChatMessage.tsx` | Sources tab renders web citations alongside meeting citations |
| `src/features/chat/components/ChatView.tsx` | `WebCitationDrawer` state + render |
| `src/features/chat/components/ChatPanel.tsx` | Web citation click opens URL directly (same pattern as meeting citations opening meetings) |
| `src/features/chat/components/WebCitationDrawer.tsx` | **NEW** — slide-in panel showing source details |
| `src/features/chat/components/InlineCitationMarker.tsx` | **NEW** — superscript `[1]` badge component |
| `src/shared/utils/inlineCitationInjector.ts` | **NEW** — post-process completed text to inject inline markers |

## Key Design Decisions

### 1. Separate from MeetingCitation
Web citations live at `ChatMessage.webCitations` (top-level), **not** inside `toolActivity`. Meeting citations remain in `toolActivity.citations`. The Sources tab shows a **union** of both.

**Rationale:** Web citations come from the adapter layer (streaming metadata), not from tool execution. Mixing them into `toolActivity` would conflate two separate data sources and make the code harder to reason about.

### 2. Citations arrive on final/late chunks — not during streaming
All three providers deliver citation data at the end of the response:
- Gemini: `groundingMetadata` arrives on later chunks (often the final one)
- Anthropic: `web_search_tool_result` blocks come as `content_block_start/stop` events
- OpenAI: annotations are only available from `finalResponse()`

We buffer citations and attach them after streaming completes, just like `tokenCount` and `tokensPerSecond`.

### 3. Favicon derived at render time
Favicons are fetched via `https://www.google.com/s2/favicons?domain=DOMAIN&sz=16` at render time. We do **not** persist favicon URLs or binary data — they're ephemeral UI concerns.

### 4. Inline markers on completed text only
Inline citation markers (`[1]`, `[2]`) are injected into completed text only, never during streaming. This avoids complex offset tracking during incremental text arrival. The `inlineCitationInjector` utility post-processes the final text.

### 5. WebCitationDrawer mirrors MeetingCitationDrawer
Same CSS transition pattern, same backdrop+panel structure, same theme tokens. The only difference is content (URL/snippet vs transcript/summary).

### 6. ChatPanel opens URLs directly
In the sidebar `ChatPanel`, clicking a web citation opens the URL in a new tab (`window.open(url, '_blank')`). No drawer needed — the sidebar is already narrow. This mirrors how `ChatPanel` handles meeting citations (navigates to the meeting directly, no drawer).

## Implementation Phases

| Phase | Doc | Description |
|-------|-----|-------------|
| 1 | [01-types.md](./01-types.md) | New types, utility functions |
| 2 | [02-adapters.md](./02-adapters.md) | Per-adapter citation extraction |
| 3 | [03-data-flow.md](./03-data-flow.md) | ChatContext accumulation + storage |
| 4 | [04-sources-tab.md](./04-sources-tab.md) | Extend Sources tab for web citations |
| 5 | [05-inline-citations.md](./05-inline-citations.md) | Inline citation markers in markdown |
| 6 | [06-sources-drawer.md](./06-sources-drawer.md) | WebCitationDrawer component |

Each phase is independently verifiable and can be merged separately.
