# Phase 4: Chat Scroll Behavior

## Problem

The chat view auto-scrolls to the bottom on every streaming chunk. This is disorienting — users can't read the response as it streams because the viewport keeps jumping. The desired behavior (modeled after Mistral's Le Chat) is:

1. **First AI response:** Do an initial scroll to show the response beginning, then freeze the viewport. Let the stream grow below. Show scroll-to-bottom button when content overflows.
2. **Subsequent turns:** Push the user message to the top of the viewport, show the AI response starting below it, then freeze.
3. **User scrolls during stream:** Follow the user's scroll intent. Don't fight it.

## Current Implementation

**Library:** `use-stick-to-bottom` (v1.1.3)

**ChatView.tsx (lines 120-149):**
```tsx
<StickToBottom className="relative flex-1 overflow-y-hidden" initial="smooth" resize="smooth" role="log">
  <StickToBottom.Content>
    {messages.map(...)}
  </StickToBottom.Content>
  <ScrollToBottomBtn />
</StickToBottom>
```

**ChatPanel.tsx:** Identical pattern (lines 208-237).

**Behavior:** `resize="smooth"` means every time the content grows (each streaming token), the library smoothly scrolls to keep the bottom visible. This is the auto-scroll that needs to change.

## Mistral's Approach (from Playwright analysis)

Mistral uses a custom spring-physics scroll engine with these key behaviors:

1. **On generation start:** Sets `shouldStopScroll = true`
2. **ResizeObserver on content:** On each content growth during streaming, calls `stopScroll()` which sets `escapedFromLock = true, isAtBottom = false`
3. **Initial scroll:** One-time `scrollToBottom()` when assistant response first appears (desktop only)
4. **User wheel/touch:** Clears `shouldStopScroll`, letting the user scroll freely
5. **Spring physics:** `{ damping: 0.7, stiffness: 0.05, mass: 1.25 }` for all programmatic scrolls
6. **Near-bottom threshold:** 70px — if user scrolls back within 70px of bottom, re-engage auto-scroll

## Plan

We do NOT need to replicate Mistral's spring-physics engine. The `use-stick-to-bottom` library is capable but needs different configuration. The key insight is: **we need to manually control when auto-scroll is active vs frozen.**

### Step 1: Add a streaming-aware scroll controller

Create a new hook: `src/features/chat/hooks/useStreamingScroll.ts`

This hook wraps the `use-stick-to-bottom` context and adds streaming awareness:

```typescript
import { useCallback, useRef, useEffect } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

interface UseStreamingScrollOptions {
  isStreaming: boolean;      // true when any message has state === 'streaming'
  messageCount: number;      // total messages in current session
}

export function useStreamingScroll({ isStreaming, messageCount }: UseStreamingScrollOptions) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const hasScrolledForCurrentStream = useRef(false);
  const prevMessageCount = useRef(messageCount);
  const userHasScrolled = useRef(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // Detect new user message (messageCount increased) → scroll to show it
  useEffect(() => {
    if (messageCount > prevMessageCount.current) {
      // New message added — scroll to bottom to show it
      scrollToBottom();
      hasScrolledForCurrentStream.current = false;
      userHasScrolled.current = false;
    }
    prevMessageCount.current = messageCount;
  }, [messageCount, scrollToBottom]);

  // When streaming starts, do one initial scroll then stop
  useEffect(() => {
    if (isStreaming && !hasScrolledForCurrentStream.current) {
      hasScrolledForCurrentStream.current = true;
      scrollToBottom();
      // After initial scroll, we want to STOP auto-scrolling.
      // The StickToBottom component handles this if we "escape" from the bottom.
    }
    if (!isStreaming) {
      hasScrolledForCurrentStream.current = false;
    }
  }, [isStreaming, scrollToBottom]);

  // Track user scroll events to know if they've manually scrolled
  const onUserScroll = useCallback(() => {
    if (isStreaming) {
      userHasScrolled.current = true;
    }
  }, [isStreaming]);

  return {
    isAtBottom,
    scrollToBottom,
    onUserScroll,
    scrollContainerRef,
    showScrollButton: !isAtBottom,
  };
}
```

### Step 2: Modify StickToBottom configuration

The critical change is the `resize` prop on `<StickToBottom>`. Currently `resize="smooth"` which auto-scrolls on every content growth.

**Option A — Conditional prop:** Change `resize` dynamically based on streaming state:
- While streaming: `resize="none"` or remove the resize prop (no auto-scroll on content growth)
- While not streaming: `resize="smooth"` (normal behavior for non-streaming content changes)

**Option B — Stop/escape mechanism:** After the initial scroll-to-bottom, programmatically "escape" from the bottom lock so the library stops auto-scrolling. This is what Mistral does with `stopScroll()`.

**Recommendation: Option A** is simpler and uses the library's own API. The `resize` prop controls what happens when content grows — setting it to `"none"` during streaming achieves exactly what we want.

However, `use-stick-to-bottom` may not support `resize="none"`. Check the library's API:
- If it supports `resize={false}` or omitting the prop → use that
- If not → we need to intercept the scroll behavior via the context

**Fallback (Option C):** If the library doesn't support disabling resize-scroll, we can:
1. Remove `use-stick-to-bottom` entirely
2. Implement a minimal scroll controller using `useRef` for the scroll container + `ResizeObserver` + manual `scrollTop` manipulation

This is more work but gives us full control. Mistral's approach proves it's the production pattern.

### Step 3: Update ChatView.tsx

Replace the current `StickToBottom` usage with the new scroll controller:

```tsx
// Determine streaming state
const isStreaming = currentMessages.some(m => m.state === 'streaming' || m.state === 'loading');

// Pass to StickToBottom with dynamic resize
<StickToBottom
  className="relative flex-1 overflow-y-hidden"
  initial="smooth"
  resize={isStreaming ? false : "smooth"}  // ← KEY CHANGE
  role="log"
>
```

If Option C (custom controller), replace `StickToBottom` with:

```tsx
<div
  ref={scrollContainerRef}
  className="relative flex-1 overflow-y-auto"
  onWheel={handleUserScroll}
  role="log"
>
  <div ref={contentRef} className={`flex flex-col ${TYPOGRAPHY_CLASSES.chatSpacing} ${TYPOGRAPHY_CLASSES.chatContainer}`}>
    {messages.map(...)}
  </div>
  {showScrollButton && <ScrollToBottomBtn onClick={scrollToBottom} />}
</div>
```

### Step 4: Update ChatPanel.tsx

Apply the identical changes. Both views share the same scroll behavior contract.

### Step 5: Scroll-to-bottom button polish

Current button is functional but basic. Enhance:

1. **Animation:** Add enter/exit animation (scale + opacity, 200ms). Use CSS transitions or Framer Motion if already in deps.
2. **Position:** Keep `absolute bottom-4 left-1/2 -translate-x-1/2` (centered).
3. **Visibility logic:** Show when `isAtBottom === false` AND content overflows the container.

The existing `ScrollToBottomBtn` component in both ChatView and ChatPanel already handles this correctly — no changes needed to the button itself, only to when `isAtBottom` becomes false.

### Step 6: Handle edge cases

1. **Very short responses:** If the AI response fits entirely within the viewport, no scroll needed. The scroll button should not appear.
2. **User at bottom when stream completes:** If the user manually scrolled to bottom during streaming, re-engage sticky behavior so future content changes (e.g., suggestions appearing) scroll normally.
3. **Window resize during streaming:** The content area may change height. The scroll position should be preserved relative to the content the user is reading.
4. **Multiple rapid messages:** If the user sends messages quickly (before the previous stream completes), each new user message should trigger a scroll-to-bottom.

## Decision Point

Before implementing, verify whether `use-stick-to-bottom` supports disabling auto-scroll during streaming:

```bash
# Check the library's source/types
cat node_modules/use-stick-to-bottom/dist/index.d.ts
```

If the library supports a `resize={false}` or `enabled` prop → use Option A (simplest).
If not → implement Option C (custom scroll controller).

## Verification

1. **First message test:** Send a message. AI response starts streaming. Viewport should show the beginning of the response and NOT scroll as content grows. When content overflows, scroll-to-bottom button appears.

2. **Second turn test:** Send a follow-up. User message should scroll to the top of the viewport. AI response starts below it. Same freeze behavior.

3. **User scroll test:** While AI is streaming, scroll up. The viewport should follow your scroll. The stream continues growing below without pulling you back down.

4. **Scroll-to-bottom test:** While streaming, click the scroll-to-bottom button. Viewport should jump to the bottom. If you stay at the bottom, it should stick (auto-scroll re-engaged).

5. **Short response test:** Send a message that gets a one-line response. No scroll button should appear. No jarring scroll behavior.

6. **ChatPanel test:** Repeat all above tests in the sidebar chat panel. Behavior should be identical.
