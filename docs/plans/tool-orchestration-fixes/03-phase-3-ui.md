# Phase 3 — UI: Settings, Chat Indicators, Animations

> Goal: Full user-facing experience. Per-model settings modal with tools toggle, tool activity indicators in chat messages, smooth animations that respect the streaming store pattern, and proper state-to-UI mapping.

---

## 3.1 Per-Model Settings Modal

**File: `src/features/settings/components/ModelSettingsModal.tsx`** (NEW)

### Trigger

In `ProvidersPanel.tsx`, each model in the "Selected Models" list gets a gear icon button. Clicking it opens the modal for that specific model.

```
[model-icon] gpt-4o                    [gear] [delete]
[model-icon] gemma-3-4b-it-q3_k_l      [gear] [delete]
```

The gear icon uses the existing `THEME.COMPONENT.iconButton` styling — small, subtle, consistent with existing delete buttons.

### Modal Content

Minimal. One section for now, extensible later.

```
┌─────────────────────────────────────┐
│  Model Settings                   X │
│  gemma-3-4b-it-q3_k_l              │
│  ─────────────────────────────────  │
│                                     │
│  Tool Use                           │
│  ┌─────────────────────────────┐    │
│  │ Enable tool calling    [  ] │    │
│  │                             │    │
│  │ When enabled, the model can │    │
│  │ search your meetings and    │    │
│  │ retrieve context on demand. │    │
│  │                             │    │
│  │ Requires model support for  │    │
│  │ function calling. Most      │    │
│  │ remote models support this. │    │
│  │ For local models, check if  │    │
│  │ your GGUF model was trained │    │
│  │ with tool-use capability.   │    │
│  └─────────────────────────────┘    │
│                                     │
│                        [Save]       │
└─────────────────────────────────────┘
```

### Component Design

- Uses the existing `shared/components/` modal patterns (backdrop, close button, escape to dismiss)
- Toggle component: Reuse existing `features/settings/components/shared/Toggle.tsx`
- Info text: Use `THEME.TEXT.secondary` + `THEME.TEXT.muted` for the helper
- Save persists via `SettingsContext.updateProvider()` → updates the `Model.toolsEnabled` field
- Surface: `THEME.SURFACE.modal` with `THEME.BORDER.default`

### State Flow

```
User clicks gear icon
  → Modal opens with current model's toolsEnabled value
  → User toggles
  → User clicks Save (or toggle auto-saves, TBD)
  → SettingsContext.updateProvider(providerName, updatedConfig)
    → Provider's models array updated with new toolsEnabled value
    → Persisted to storage
  → Modal closes
  → Next chat message uses the updated flag
```

### ProvidersPanel Changes

**File: `src/features/settings/components/ProvidersPanel.tsx`**

Add the gear icon next to each model. Manage modal open/close state with `useState<{ provider: string; modelId: string } | null>(null)`.

---

## 3.2 Tool Activity Indicator in Chat

**File: `src/features/chat/components/ToolActivityIndicator.tsx`** (NEW)

### When It Shows

During an active tool-calling turn, between the streaming text and the "still loading" indicator. It appears when `aiActivity.isCallingTool === true` and disappears when `aiActivity` is cleared.

### Visual Design

A compact inline indicator below the streaming text area, above where the action bar would be. Subtle, informative, not distracting.

```
┌──────────────────────────────────────────────┐
│  [provider-icon]  Claude 3.5 Sonnet          │
│                                              │
│  Let me look into your meeting history       │
│  for that...                                 │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  ◎ Searching meetings · "database      │  │
│  │    migration"                           │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Based on 3 meetings I found, here's the     │
│  timeline of decisions...                    │
│                                              │
└──────────────────────────────────────────────┘
```

### States

The indicator cycles through phases based on `ToolActivity.phase`:

| Phase | Visual | Text |
|-------|--------|------|
| `calling` | Pulsing dot | "Calling {toolName}..." |
| `executing` | Spinning dot | Tool-specific text (see below) |
| `result` | Check dot (brief) | "Found {N} results" or "Loaded meeting data" |
| `error` | Warning dot (brief) | "Couldn't {action}" |

### Tool-Specific Display Text

| Tool | Executing Text |
|------|---------------|
| search_meetings | `Searching meetings · "{query}"` |
| get_meeting | `Loading meeting data · "{meetingTitle}"` |
| list_meetings | `Browsing recent meetings` |
| get_action_items | `Checking action items` |

The `detail` field from `ToolActivity` provides this. The orchestrator formats it when calling `onToolActivity`.

### Animation

- **Enter**: `opacity: 0 → 1`, `translateY: 4px → 0`, duration: `ANIMATION_CONFIG.duration.fast` (150ms)
- **Phase transitions**: Crossfade text, duration: `ANIMATION_CONFIG.duration.fast`
- **Exit**: `opacity: 1 → 0`, duration: `ANIMATION_CONFIG.duration.fast`
- **Pulsing dot**: CSS animation, `ANIMATION_CONFIG.loading.pulseSpeed` (2000ms cycle)
- **Spinning dot**: CSS animation, `ANIMATION_CONFIG.loading.spinnerSpeed` (1000ms cycle)

Use CSS animations (not Framer Motion) for the dot — avoids JS-driven animation during streaming which could compete with the streaming store's render cycle.

### No Re-render Impact

The indicator reads from `ChatContext.aiActivity`. This state changes infrequently (once per tool call, not per chunk). The ChatMessage component already memo-skips during streaming. The indicator is a **separate child component** that reads `aiActivity` directly from context — it doesn't cause the parent ChatMessage to re-render.

```
ChatMessage (memo: skips during streaming)
  ├── AnimatedProviderIcon
  ├── StreamingContent (external store, independent)
  ├── ToolActivityIndicator (reads aiActivity from context, independent)
  └── ActionBar (only renders when complete)
```

---

## 3.3 aiActivity State Extension

**File: `src/shared/contexts/ChatContext.tsx`**

### Extended Type

```typescript
aiActivity: {
  // Existing (keep for Anthropic thinking / web search)
  isThinking?: boolean;
  isSearching?: boolean;
  searchQuery?: string;
  thinkingContent?: string;

  // New (tool calling)
  isCallingTool?: boolean;
  toolName?: string;
  toolPhase?: 'calling' | 'executing' | 'result' | 'error';
  toolDetail?: string;
  toolIteration?: number;
} | null;
```

### Lifecycle

```
sendMessage() start
  → aiActivity = null

First chunk arrives (loading → streaming)
  → aiActivity = null (streaming text normally)

Tool call detected by orchestrator
  → aiActivity = { isCallingTool: true, toolName: 'search_meetings', toolPhase: 'calling' }

Tool executing
  → aiActivity = { isCallingTool: true, toolName: 'search_meetings', toolPhase: 'executing', toolDetail: '...' }

Tool result
  → aiActivity = { isCallingTool: true, toolName: 'search_meetings', toolPhase: 'result', toolDetail: 'Found 3 meetings' }
  → Brief pause (~500ms) so user can see the result notification

LLM resumes streaming
  → aiActivity = null (back to normal streaming)

Another tool call
  → Repeat cycle

Orchestrator loop complete
  → aiActivity = null

Error/Abort
  → aiActivity = null
```

### Debounce Consideration

Tool activity updates happen in rapid succession (calling → executing → result → next call). To prevent flicker, the `ToolActivityIndicator` should have a minimum display time per phase (~300ms). If a phase transition happens faster than that, the indicator holds the previous phase until the minimum time passes, then transitions.

This is handled in the indicator component, not in the state — keeps state clean and truthful.

---

## 3.4 ChatMessage Component Changes

**File: `src/features/chat/components/ChatMessage.tsx`**

### Additions

1. **ToolActivityIndicator**: Rendered for assistant messages in `streaming` state when `aiActivity?.isCallingTool` is true.

2. **Tool badge on completed messages**: If the committed message has `toolActivity` metadata, show a subtle badge:

```
┌──────────────────────────────────┐
│  [provider-icon]  Claude 3.5     │
│                                  │
│  Based on the meetings I found...│
│                                  │
│  ┌──────────────────┐            │
│  │ 🔧 Used 2 tools  │            │
│  └──────────────────┘            │
│                                  │
│  [copy] [regen] · 142 tok/s      │
└──────────────────────────────────┘
```

The badge is a small chip using `THEME.SURFACE.chip` + `THEME.TEXT.muted`. Clicking it could expand to show which tools were called (stretch goal — not required for Phase 3).

### Memo Update

The custom memo comparator needs to account for `toolActivity`:

```typescript
// Add to memo check for complete state:
prev.toolActivity === next.toolActivity
```

During streaming, memo still skips (no change). ToolActivityIndicator reads from context directly.

---

## 3.5 ChatMessage Type Extension

**File: `types.ts`**

```typescript
interface ChatMessage {
  // ... existing fields ...

  /** Metadata about tool calls made during this response (persisted) */
  toolActivity?: {
    calls: Array<{
      toolName: string;
      executionMs: number;
      resultSummary?: string;
    }>;
    totalIterations: number;
  };
}
```

This metadata is populated by the orchestrator when the loop completes (in ChatContext's completion handler). It's persisted with the message. Lightweight — no full tool results, just names + timing.

---

## 3.6 ChatInput: Tool Indicator

**File: `src/features/chat/components/ChatInput.tsx`**

### Selected Model Indicator

When the selected chat model has `toolsEnabled: true`, show a subtle indicator in the ChatInput toolbar (near the model picker and web search toggle):

```
[ModelPicker: Claude 3.5 ▾]  [🔧]  [🌐 Web Search]  [Send]
```

The tools icon (wrench or similar from lucide-react) is a **non-interactive badge** — it just shows that tools are active for this model. Keeps the user aware without adding another toggle to manage.

- Uses `THEME.TEXT.muted` when tools enabled
- Hidden when tools not enabled
- Tooltip: "Tools enabled for this model"

### Why Not a Toggle?

The tools toggle lives in per-model settings (the modal). Having it also in ChatInput would create two sources of truth. The ChatInput badge is read-only — it reflects the model's configuration.

---

## 3.7 Loading State Text

**File: `src/features/chat/components/ChatMessage.tsx`**

Currently the loading state shows "Working on it..." or "Loading {model} into memory...". With tool calling, we can make this more informative:

When `aiActivity.isCallingTool` is true during the loading phase (before first text chunk):

```
Loading state → "Preparing tools..."
```

This is a minor text change. The actual tool activity indicator takes over once streaming begins.

---

## 3.8 Storage / Persistence

### ChatMessage Serialization

The `toolActivity` field on `ChatMessage` is a plain object — serializes to JSON naturally. No changes to the storage layer (`services/storage/chats.service.ts`) needed.

The storage converter (`fromStoredMessage` / `toStoredMessage`) passes through unknown fields, so `toolActivity` will persist without explicit handling. Verify this during implementation.

### Settings Persistence

`Model.toolsEnabled` persists as part of the provider config via `SettingsContext`. No new storage mechanism needed.

---

## 3.9 Animation Safety Checklist

| Animation | Mechanism | Re-render Safe? | Notes |
|-----------|-----------|----------------|-------|
| Tool indicator enter/exit | CSS transition (opacity + transform) | Yes | No JS animation during streaming |
| Pulsing dot | CSS `@keyframes` | Yes | Pure CSS, zero JS cost |
| Spinning dot | CSS `@keyframes` | Yes | Matches existing loading ring |
| Phase text crossfade | CSS transition on opacity | Yes | Text swap via conditional render |
| Tool badge on complete | CSS `@keyframes fadeIn` | Yes | Only renders once on complete |
| Modal open/close | Existing modal pattern | N/A | Not during streaming |

**Rule**: No Framer Motion inside the streaming message during active streaming. CSS animations only. Framer Motion is fine for the settings modal (not streaming-related).

---

## 3.10 Acceptance Criteria (Phase 3)

- [ ] Per-model settings modal opens from gear icon in ProvidersPanel
- [ ] Tools toggle persists across app restarts
- [ ] Tool activity indicator shows during tool calling with correct phases
- [ ] Indicator animations are smooth, no jank during streaming
- [ ] Tool badge shows on completed messages that used tools
- [ ] ChatInput shows tools badge when selected model has tools enabled
- [ ] No re-render regressions during streaming (verify with React Profiler)
- [ ] Loading state text updates when tools are being prepared
- [ ] Indicator has minimum display time per phase (no flicker on fast tool execution)
- [ ] Dark mode works correctly for all new UI elements

---

## 3.11 Files Changed/Created

| File | Action |
|------|--------|
| `src/features/settings/components/ModelSettingsModal.tsx` | **NEW** |
| `src/features/settings/components/ProvidersPanel.tsx` | Modified (gear icon, modal state) |
| `src/features/chat/components/ToolActivityIndicator.tsx` | **NEW** |
| `src/features/chat/components/ChatMessage.tsx` | Modified (indicator, badge, memo) |
| `src/features/chat/components/ChatInput.tsx` | Modified (tools badge) |
| `src/shared/contexts/ChatContext.tsx` | Modified (aiActivity type extension) |
| `types.ts` | Modified (toolActivity on ChatMessage) |
| `src/styles/tool-activity.css` | **NEW** (CSS animations for indicator) |
