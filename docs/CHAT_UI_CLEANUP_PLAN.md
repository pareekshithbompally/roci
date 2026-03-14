# Chat UI Cleanup Plan: Learning from Jan

> **Status:** Ready for Implementation
> **Created:** 2026-02-15
> **Goal:** Fix chat layout, input box sizing, scroll, and streaming to match Jan-quality UI
> **Constraint:** Preserve existing CleanMarkdown renderer and provider icon system

---

## Root Cause Analysis

After comparing both codebases, here are the **actual blockers** causing the poor chat UI:

### 1. ChatPanel is a fixed 400px side panel — NOT a full-screen chat
```tsx
// ChatPanel.tsx line 89 — THIS IS THE ROOT PROBLEM
<div className="w-[400px] h-full border-l ...">
```
Jan's chat is the **main content area** (`flex-1`, full width). Your chat is crammed into a 400px sidebar. Everything flows from this constraint — the `max-w-[80%]` on messages means **80% of 400px = 320px**, and `max-w-[80%]` on the input = **320px input box**. That's why the input "shrunk."

### 2. Messages container has double width constraints
```tsx
// ChatPanel.tsx line 194
<div className="max-w-[80%] mx-auto px-6 py-4">
```
80% of 400px = 320px, minus 48px padding = **272px for content**. Far too narrow.

### 3. ChatInput has its own redundant 80% constraint
```tsx
// ChatInput.tsx line 146
<div className="px-6 py-4 max-w-[80%] mx-auto">
```
Same problem. Input box gets squeezed to ~272px usable width.

### 4. Manual scroll handling instead of library
Your app uses a custom `useSmartScroll` hook with manual scroll event listeners. Jan uses `use-stick-to-bottom` library which handles all edge cases (resize, content mutations, smooth behavior).

### 5. Custom char-by-char buffer draining is over-engineered
Your `ChatContext` has a 100+ line buffer-and-drain system using `requestAnimationFrame` to drip-feed characters. Jan simply uses `experimental_throttle: 50` on the AI SDK's `useChat` hook — one line that does the same thing. Your approach causes:
- Excessive React re-renders (one per rAF drain)
- Complex state management in `ChatContext`
- Race conditions between buffer/drain/flush

### 6. State management is monolithic
Your entire chat state lives in a single `ChatContext` with `useState` — sessions, messages, UI state, streaming state, buffer refs all in one blob. Every `setState` call triggers re-render of everything. Jan uses Zustand stores with selective subscriptions (`useShallow`).

---

## The Plan

### Phase 1: Fix Layout & Input (Visual Fixes)

**Goal:** Make the chat UI look right — proper widths, input sizing, scroll behavior.
**Time estimate:** These are the critical visual fixes.

---

#### Task 1.1: Remove hardcoded width constraints from ChatPanel

**File:** `src/features/chat/components/ChatPanel.tsx`

**Current (line 89):**
```tsx
<div className="w-[400px] h-full border-l border-zinc-200/70 dark:border-zinc-800 bg-[#fafaf8] dark:bg-zinc-900 flex flex-col shadow-xl">
```

**Change to:**
```tsx
<div className="w-full h-full border-l border-zinc-200/70 dark:border-zinc-800 bg-[#fafaf8] dark:bg-zinc-900 flex flex-col shadow-xl">
```

Then update **MainLayout** to control the chat panel width via the layout system:

**File:** `src/features/layout/components/MainLayout.tsx`

Find both instances of `<ChatPanel>` (lines ~111 and ~133). Wrap them so the **parent** controls width:

**Current:**
```tsx
<ChatPanel isOpen={isChatOpen} onClose={onChatToggle} />
```

**Change to:**
```tsx
{isChatOpen && (
  <div className="w-[420px] shrink-0 h-full">
    <ChatPanel isOpen={isChatOpen} onClose={onChatToggle} />
  </div>
)}
```

**Why:** Width is now controlled by the layout, not the chat component. ChatPanel becomes a flexible child that fills its container. This is exactly how Jan does it — the thread route is the content area and the layout determines how much space it gets.

---

#### Task 1.2: Remove `max-w-[80%]` from messages and input

The 80% constraint makes sense when chat is full-screen (Jan's `md:w-4/5 xl:w-4/6`). In a side panel, it wastes precious space.

**File:** `src/features/chat/components/ChatPanel.tsx`

**Current (line 194):**
```tsx
<div className="max-w-[80%] mx-auto px-6 py-4">
```

**Change to:**
```tsx
<div className="w-full px-4 py-4">
```

**File:** `src/features/chat/components/ChatInput.tsx`

**Current (line 146):**
```tsx
<div className="px-6 py-4 max-w-[80%] mx-auto">
```

**Change to:**
```tsx
<div className="px-4 py-3">
```

**Why:** In a constrained panel, content should use the full available width. Padding of 16px on each side (px-4) gives a clean 32px total margin — enough breathing room without wasting space.

---

#### Task 1.3: Fix ChatInput textarea sizing

**File:** `src/features/chat/components/ChatInput.tsx`

The current textarea container has unnecessary nesting that eats space:

**Current (lines 168-181):**
```tsx
<div className="flex items-center gap-3 px-4 pt-4 pb-2">
  <div className="flex-1 min-h-[48px] flex items-center pl-2">
    <textarea ... />
  </div>
</div>
```

**Change to:**
```tsx
<div className="px-4 pt-3 pb-1">
  <textarea
    ref={inputRef}
    value={value}
    onChange={handleInputChange}
    onKeyDown={handleKeyDown}
    placeholder={placeholder}
    disabled={disabled || isLoading}
    rows={1}
    className="w-full bg-transparent border-0 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 resize-none outline-none focus:ring-0"
    style={{ maxHeight: '200px', minHeight: '36px' }}
  />
</div>
```

**Why:** Removes the unnecessary flex wrapper and extra padding. The textarea now uses full width. `text-sm` instead of `text-base` matches Jan's input sizing and feels better in a side panel. `minHeight: 36px` instead of `48px` is more compact.

---

#### Task 1.4: Replace manual scroll with `use-stick-to-bottom`

**Install:**
```bash
npm install use-stick-to-bottom
```

**File:** `src/features/chat/components/ChatPanel.tsx`

**Current (lines 183-217):**
```tsx
<div
  ref={messagesContainerRef}
  onScroll={handleScroll}
  className="relative flex-1 overflow-y-auto scrollbar-hover"
>
  <ScrollToBottomButton ... />
  <div className="max-w-[80%] mx-auto px-6 py-4">
    <div className="space-y-4">
      {currentMessages.map(...)}
      <div ref={messagesEndRef} />
    </div>
  </div>
</div>
```

**Replace with:**
```tsx
<div className="flex-1 relative overflow-hidden">
  <StickToBottom className="relative flex-1 overflow-y-hidden h-full" resize="smooth">
    <StickToBottom.Content className="flex flex-col gap-4 px-4 py-4">
      {currentMessages.map((message, index) => (
        <ChatMessage
          key={message.id}
          id={message.id}
          role={message.role}
          text={message.text}
          timestamp={message.timestamp}
          suggestions={message.suggestions}
          isCopied={chat.copiedMessageId === message.id}
          onCopy={chat.copyMessage}
          onSuggestionClick={(suggestion) => chat.sendMessage(suggestion, historyItems, settings, providers)}
          isLastMessage={index === currentMessages.length - 1}
          provider={message.provider}
          model={message.model}
          state={message.state}
        />
      ))}
    </StickToBottom.Content>
    <ScrollToBottomBtn />
  </StickToBottom>
</div>
```

**Add new component (inline or import):**
```tsx
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

const ScrollToBottomBtn = () => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      onClick={() => scrollToBottom()}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800 shadow-lg hover:scale-110 transition-transform"
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
};
```

**Remove imports that are no longer needed:**
- `useSmartScroll` from ChatPanel
- `ScrollToBottomButton` import (replaced by inline `ScrollToBottomBtn`)
- `messagesEndRef` and `messagesContainerRef` refs

**Why:** `use-stick-to-bottom` handles all scroll edge cases (resize, new content, manual scroll detection) with zero configuration. This is exactly what Jan uses. Your `useSmartScroll` hook and `ScrollToBottomButton` component become unnecessary.

---

#### Task 1.5: Clean up streaming config references

**File:** `src/config/streaming.config.ts`

Remove `CHAT_CONTENT_WIDTH` and `SCROLL_THRESHOLD_PX` since they're no longer used:

```ts
export const STREAMING_CONFIG = {
  DRAIN_INTERVAL_MS: 30,
  BUFFER_THRESHOLD_CHARS: 100,
  ADAPTIVE_DRAIN_MULTIPLIER: 2,
  MARKDOWN_BUFFER_CHARS: 10,
  LOADING_RING_DURATION_MS: 1500,
} as const;
```

---

### Phase 2: Simplify Streaming & State Management

**Goal:** Remove over-engineered buffer draining, simplify state updates, improve performance.

---

#### Task 2.1: Replace char-by-char draining with throttled updates

The current system in `ChatContext.tsx` (lines 414-497) uses `requestAnimationFrame` to drain characters one-by-one from a buffer. This is causing excessive re-renders and complexity.

**File:** `src/shared/contexts/ChatContext.tsx`

**Remove these refs and functions (lines ~152-497):**
```tsx
// DELETE all of these:
const streamBufferRef = useRef('');
const streamDrainPosRef = useRef(0);
const streamRafIdRef = useRef<number | null>(null);
const streamLastDrainRef = useRef(0);
const streamActiveSessionRef = useRef<string | null>(null);
const streamActiveMsgIdRef = useRef<string | null>(null);

// DELETE: resetStreamBuffer, flushStreamBuffer, drainStreamBuffer, startStreamDrain
```

**Replace with a simple throttled approach in `sendMessage`:**

```tsx
// In sendMessage, replace the buffer system with direct throttled updates:

// Track accumulated text
let fullText = '';
let lastUpdateTime = 0;
const THROTTLE_MS = 50; // Same as Jan's experimental_throttle

await unifiedAIService.chatStream(
  historyItems || [],
  targetSession.messages,
  effectiveSettings,
  effectiveProviders,
  (chunk: string, metadata?: { ... }) => {
    if (metadata) {
      setState(prev => ({ ...prev, aiActivity: metadata }));
    }

    if (chunk) {
      fullText += chunk;

      // Clear activity indicator on first content
      const now = performance.now();
      if (now - lastUpdateTime >= THROTTLE_MS) {
        lastUpdateTime = now;
        const displayText = fullText.split('---SUGGESTIONS---')[0].trim();

        setState(prev => ({
          ...prev,
          aiActivity: null,
          sessions: prev.sessions.map(s => {
            if (s.id !== activeSessionId) return s;
            return {
              ...s,
              messages: s.messages.map(m =>
                m.id === assistantMsgId
                  ? { ...m, text: displayText, state: 'streaming' as const }
                  : m
              ),
            };
          }),
        }));
      }
    }
  },
  meetingContext,
  state.webSearchEnabled,
  abortControllerRef.current?.signal
);

// After stream completes — final update with full text
const parts = fullText.split('---SUGGESTIONS---');
const mainText = parts[0].trim();
const suggestions = parts[1]
  ? parts[1].split('\n').map(s => s.trim()).filter(s => s && s.length > 2)
  : undefined;

setState(prev => {
  const finalSessions = prev.sessions.map(s => {
    if (s.id !== activeSessionId) return s;
    return {
      ...s,
      messages: s.messages.map(m =>
        m.id === assistantMsgId
          ? { ...m, text: mainText, suggestions, state: 'complete' as const }
          : m
      ),
      lastMessageAt: Date.now(),
    };
  });

  const sessionToPersist = finalSessions.find(s => s.id === activeSessionId);
  if (sessionToPersist) persistSession(sessionToPersist);

  return { ...prev, sessions: finalSessions, isLoading: false, aiActivity: null };
});
```

**Why:**
- Jan uses `experimental_throttle: 50` — one config value that batches streaming updates to 50ms intervals
- Your buffer-drain approach achieves the same thing but with ~150 lines of rAF + ref management
- Throttling at 50ms = 20 UI updates/sec, which is perfectly smooth
- Eliminates the `useStreamBuffer` hook, the buffer refs in ChatContext, and the `markdownBuffer.ts` dependency during streaming

---

#### Task 2.2: Simplify ChatMessage state handling

**File:** `src/features/chat/components/ChatMessage.tsx`

The current component is fine structurally but can be simplified:

1. **Remove the `state` prop complexity.** Currently you pass `state: 'loading' | 'streaming' | 'complete'` — this can stay as-is since it matches Jan's approach (Jan uses `status` + `isLastMessage` to derive the same states).

2. **Add `React.memo` with proper comparison** (if not already memoized):

```tsx
export const ChatMessage = React.memo<ChatMessageProps>(({ ... }) => {
  // ... component body unchanged
}, (prev, next) => {
  // Only re-render if these change
  if (next.isLastMessage && next.state === 'streaming') return false; // Always re-render streaming
  return (
    prev.text === next.text &&
    prev.state === next.state &&
    prev.isCopied === next.isCopied &&
    prev.isLastMessage === next.isLastMessage
  );
});
```

**Why:** Jan wraps `MessageItem` in `React.memo` with a custom comparator that always re-renders during streaming but skips re-renders for static messages. This prevents the entire message list from re-rendering on each streaming chunk.

---

#### Task 2.3: Remove now-unused streaming infrastructure

After Task 2.1, these files/exports become dead code:

**Delete or gut:**
- `src/features/chat/hooks/useStreamBuffer.ts` — no longer used
- `src/shared/utils/markdownBuffer.ts` — the `bufferPartialMarkdown` can stay if `CleanMarkdown` still uses it, but the complex buffer management is gone
- `src/features/chat/hooks/useSmartScroll.ts` — replaced by `use-stick-to-bottom`
- `src/features/chat/components/ScrollToBottomButton.tsx` — replaced by inline component

**Update exports:**
- `src/features/chat/hooks/index.ts` — remove `useStreamBuffer` and `useSmartScroll` exports
- `src/features/chat/components/index.ts` — remove `ScrollToBottomButton` export

**Keep:**
- `components/CleanMarkdown.tsx` — your markdown renderer is good, preserve it
- `src/features/chat/components/AnimatedProviderIcon.tsx` — your provider icon is nice, keep it
- `src/config/streaming.config.ts` — keep `LOADING_RING_DURATION_MS` for the icon, remove streaming buffer constants

---

#### Task 2.4: (Optional) Improve ChatContext performance

If after Phase 2 Tasks 2.1-2.3 the UI still feels sluggish, consider these Jan-inspired improvements:

**Option A: Split state into multiple refs**
```tsx
// Instead of one giant setState that re-renders everything:
const [uiState, setUiState] = useState({ input: '', viewHistory: false, ... });
const sessionsRef = useRef<ChatSession[]>([]);
const [currentMessages, setCurrentMessages] = useState<ChatMessage[]>([]);
```

**Option B: Move to Zustand (Jan's approach)**
Jan uses Zustand with `useShallow` for selective subscriptions. This is a bigger refactor but eliminates unnecessary re-renders entirely. Consider this if the simpler fixes don't help.

---

## Files Summary

### Phase 1 Changes
| File | Action | Description |
|------|--------|-------------|
| `src/features/chat/components/ChatPanel.tsx` | **Modify** | Remove `w-[400px]`, remove `max-w-[80%]`, replace scroll system |
| `src/features/chat/components/ChatInput.tsx` | **Modify** | Remove `max-w-[80%]`, fix textarea sizing, reduce padding |
| `src/features/layout/components/MainLayout.tsx` | **Modify** | Wrap ChatPanel in width-controlling container |
| `src/config/streaming.config.ts` | **Modify** | Remove unused layout constants |
| `package.json` | **Modify** | Add `use-stick-to-bottom` dependency |

### Phase 2 Changes
| File | Action | Description |
|------|--------|-------------|
| `src/shared/contexts/ChatContext.tsx` | **Modify** | Remove buffer system, add 50ms throttle |
| `src/features/chat/components/ChatMessage.tsx` | **Modify** | Add React.memo with smart comparator |
| `src/features/chat/hooks/useStreamBuffer.ts` | **Delete** | Replaced by throttle |
| `src/features/chat/hooks/useSmartScroll.ts` | **Delete** | Replaced by use-stick-to-bottom |
| `src/features/chat/components/ScrollToBottomButton.tsx` | **Delete** | Replaced by inline component |
| `src/features/chat/hooks/index.ts` | **Modify** | Remove deleted exports |
| `src/features/chat/components/index.ts` | **Modify** | Remove deleted exports |

### Preserved (No Changes)
| File | Why |
|------|-----|
| `components/CleanMarkdown.tsx` | Your markdown renderer is solid |
| `src/features/chat/components/AnimatedProviderIcon.tsx` | Clean design, works well |
| `src/features/chat/components/ChatHistoryList.tsx` | Not related to chat display |
| `src/features/chat/components/ModelPicker.tsx` | Not related to layout |
| `src/features/chat/components/MeetingMentionPopup.tsx` | Not related to layout |
| `src/features/chat/components/ContextChips.tsx` | Not related to layout |

---

## Execution Order

```
Phase 1 (do these in order):
  1.1 → 1.2 → 1.3 → 1.4 → 1.5

  After Phase 1: npm run build && npm run tauri:dev
  Test: Chat opens, input is full-width, messages don't look cramped, scroll works

Phase 2 (do these in order):
  2.1 → 2.2 → 2.3 → (optional 2.4)

  After Phase 2: npm run build && npm run tauri:dev
  Test: Streaming is smooth, no jitter, no rAF leaks, memory stable
```

---

## Key Differences: Jan vs Kasset AI

| Aspect | Jan | Kasset AI (Current) | Kasset AI (After) |
|--------|-----|------------------------|----------------------|
| Chat layout | Full-screen main content | 400px side panel | Width-controlled side panel |
| Content width | `md:w-4/5 xl:w-4/6` (responsive) | `max-w-[80%]` (of 400px = tiny) | `w-full px-4` (full panel width) |
| Input width | Same as content width | `max-w-[80%]` (tiny) | `w-full px-4` (full panel width) |
| Scroll | `use-stick-to-bottom` library | Custom `useSmartScroll` hook | `use-stick-to-bottom` |
| Streaming | `experimental_throttle: 50` | Custom rAF buffer drain | 50ms throttled updates |
| State | Zustand + selective subs | Single React Context + useState | Same context, simpler logic |
| Message memo | Custom comparator | None | Custom comparator |
