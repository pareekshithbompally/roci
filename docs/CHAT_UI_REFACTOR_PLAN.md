# Chat UI Refactor Plan: Stream Smoothing & Scroll Management

> **Status:** Ready for Implementation  
> **Created:** 2026-01-29  
> **Scope:** Refactor chat rendering and scroll systems using "Gold Standard" patterns

---

## Overview

Refactor the Chat Message rendering and Scroll Management systems to eliminate jitter, implement smooth streaming, and match the Jan app reference design.

**Key Decisions:**
- ✅ Message Actions: Copy, Edit, Delete, Regenerate (all four)
- ✅ Token Stats: Display actual token count from API response
- ✅ Thinking/Searching States: Subtle inline indicator below provider icon, expandable for thinking content

---

## Phase 1: Stream Smoothing Integration & Core Rendering

**Goal:** Eliminate jittery streaming by fully integrating the pacing engine with ChatContext

### Task 1.1: Audit useStreamBuffer Hook
**File:** `src/features/chat/hooks/useStreamBuffer.ts`

- [ ] Verify drain logic works correctly with requestAnimationFrame
- [ ] Ensure adaptive speed kicks in when buffer > 100 chars
- [ ] Add edge case handling (empty chunks, rapid chunks)
- [ ] Write unit test: `tests/unit/useStreamBuffer.test.ts`

**Test Command:**
```bash
npx vitest tests/unit/useStreamBuffer.test.ts --run
```

---

### Task 1.2: Integrate useStreamBuffer into ChatContext
**File:** `src/shared/contexts/ChatContext.tsx`

**Current behavior (lines 533-562):**
```typescript
// Raw chunks go directly to state - causes jitter
fullText += chunk;
setState(prev => ({ ...prev, sessions: ... }));
```

**Target behavior:**
```typescript
// Chunks go to buffer, drain loop updates state smoothly
streamBuffer.pushChunk(chunk);
if (!streamBuffer.isDraining) {
  streamBuffer.startDrain();
}
// Drain callback updates state at paced intervals
```

**Changes needed:**
- [ ] Import and instantiate useStreamBuffer in ChatContext
- [ ] Modify `sendMessage` to push chunks to buffer instead of direct state
- [ ] Add drain callback that updates message state
- [ ] Handle stream completion: flush remaining buffer, transition to 'complete'
- [ ] Clean up buffer on new message or unmount

---

### Task 1.3: Enhance Message State Transitions
**File:** `src/features/chat/components/ChatMessage.tsx`

**State machine:**
```
LOADING:
  - AnimatedProviderIcon with isAnimating=true
  - Text: "Working on it..."
  - No timestamp

STREAMING:
  - AnimatedProviderIcon with isAnimating=true (keep spinning)
  - Text: streaming content from buffer drain
  - No timestamp
  - No suggestions

COMPLETE:
  - AnimatedProviderIcon with isAnimating=false
  - Full text content
  - Timestamp appears (fade-in)
  - Divider line
  - Suggestions list (if any)
  - Message actions bar (on hover)
```

**Changes needed:**
- [ ] Keep icon animating during STREAMING (currently stops too early)
- [ ] Add smooth fade-in animation for timestamp
- [ ] Ensure suggestions only render on COMPLETE state

---

### Task 1.4: Verify AnimatedProviderIcon Animation
**File:** `src/features/chat/components/AnimatedProviderIcon.tsx`

- [ ] Test conic-gradient animation smoothness on WebKit/Tauri
- [ ] Verify animation stops cleanly (no stuck state)
- [ ] Consider adding `will-change: transform` for GPU acceleration
- [ ] Test with different provider icons (Gemini, OpenAI, Anthropic)

---

### Task 1.5: Validate Markdown Buffering
**Files:** `components/CleanMarkdown.tsx`, `src/shared/utils/markdownBuffer.ts`

**Test scenarios:**
- [ ] Partial code block: ` ```python\nprint("hel ` → should buffer
- [ ] Complete code block: ` ```python\nprint("hello")\n``` ` → should render
- [ ] Partial bold: `**hello` → should buffer
- [ ] Complete bold: `**hello**` → should render
- [ ] Mixed content with partial at end

**Write test:** `tests/unit/markdownBuffer.test.ts`

---

## Phase 2: Scroll Management & Layout Refinement

**Goal:** Implement robust scroll anchoring and refine chat layout

### Task 2.1: Audit useSmartScroll Hook
**File:** `src/features/chat/hooks/useSmartScroll.ts`

- [ ] Verify 100px threshold detection works correctly
- [ ] Ensure RAF-wrapped scroll updates
- [ ] Test: manual scroll up → new content → stays in place
- [ ] Test: near bottom → new content → auto-scrolls
- [ ] Add debounce to scroll handler if needed (performance)

---

### Task 2.2: Unify Scroll Handling in ChatView
**File:** `src/features/chat/components/ChatView.tsx`

**Current (lines 28-35):** Manual scroll handling with ref
**Target:** Use `useSmartScroll` hook consistently

**Changes needed:**
- [ ] Replace manual `handleScroll` with `useSmartScroll`
- [ ] Add ScrollToBottomButton component
- [ ] Ensure scroll state syncs with streaming state

---

### Task 2.3: Add CSS Scroll Optimization
**File:** `index.css` or create `src/styles/chat.css`

```css
/* Add to scrollable chat containers */
.chat-scroll-container {
  overflow-anchor: auto;
  scroll-behavior: smooth;
}

/* Prevent layout shift during streaming */
.chat-message-streaming {
  min-height: 60px;
}
```

- [ ] Add `overflow-anchor: auto` to ChatView and ChatPanel containers
- [ ] Test on Tauri/WebKit specifically
- [ ] Verify no scroll jumping during rapid updates

---

### Task 2.4: Enhance ScrollToBottomButton
**File:** `src/features/chat/components/ScrollToBottomButton.tsx`

**Current:** Basic show/hide based on props
**Target:** Smart visibility with animations

**Changes needed:**
- [ ] Show when: `isUserScrolledUp && isStreaming`
- [ ] Hide when: stream completes OR user scrolls to bottom
- [ ] Add pulse animation when new content arrives while hidden
- [ ] Smooth slide-up entrance, fade-out exit

---

### Task 2.5: Verify Chat Layout Widths
**Files:** `ChatView.tsx`, `ChatPanel.tsx`, `ChatInput.tsx`

**Target layout:**
```
|  10%  |        80% content         |  10%  |
|       |  messages + input centered |       |
|  ← scrollable area spans 100% →           |
```

- [ ] ChatView: Verify `max-w-3xl mx-auto` achieves ~80% on typical screens
- [ ] ChatPanel: Already has `max-w-[80%] mx-auto` in message area ✓
- [ ] ChatInput: Has `max-w-[80%]` - verify matches content width
- [ ] Ensure parent container is scrollable (not inner content)

---

### Task 2.6: Scrollbar Styling
**File:** `index.css`

- [ ] Verify `.scrollbar-hover` class exists and works
- [ ] Minimal scrollbar that appears on hover
- [ ] Match dark/light theme colors
- [ ] Test on macOS WebKit

---

## Phase 3: Message Polish & UI Enhancements

**Goal:** Add finishing touches matching Jan app reference

### Task 3.1: Create MessageActions Component
**New File:** `src/features/chat/components/MessageActions.tsx`

```typescript
interface MessageActionsProps {
  messageId: string;
  messageText: string;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  tokenCount?: number;
  tokensPerSecond?: number;
  isCopied: boolean;
}
```

**Features:**
- [ ] Copy button (existing functionality)
- [ ] Edit button → enters edit mode (optional, can stub)
- [ ] Delete button → confirms and removes message
- [ ] Regenerate button → re-sends previous user message
- [ ] Token stats: "X tokens" and "Y tokens/sec" if available
- [ ] Show on hover, positioned at message bottom
- [ ] Tailwind styling matching Jan app (subtle, clean)

**Integration:**
- [ ] Add to ChatMessage.tsx for assistant messages
- [ ] Wire up handlers in ChatContext

---

### Task 3.2: Track Token Stats from API
**File:** `src/shared/contexts/ChatContext.tsx`

**Required data:**
- `tokenCount`: Total tokens in response
- `tokensPerSecond`: Streaming speed (tokens / duration)

**Implementation:**
- [ ] Track stream start time when first chunk arrives
- [ ] Estimate token count (chars / 4 rough estimate, or use API if available)
- [ ] Calculate tokens/sec on stream complete
- [ ] Store in message metadata: `message.metadata.tokenCount`, `message.metadata.tokensPerSecond`

**Note:** If API provides actual token counts, use those. Otherwise, estimate responsibly.

---

### Task 3.3: Enhance Timestamp Formatting
**New File:** `src/shared/utils/timeFormat.ts`

```typescript
export function formatMessageTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}
```

- [ ] Create utility function
- [ ] Update ChatMessage to use new formatter
- [ ] Consider auto-refresh for "Just now" → "1m ago" transitions

---

### Task 3.4: Add Thinking/Searching State Display
**File:** `src/features/chat/components/ChatMessage.tsx`

**Current:** `aiActivity` state exists in ChatContext but not displayed

**Target:** Show inline indicator in LOADING state:
```
[Gemini Icon spinning] Working on it...
                       ↳ Thinking...
                       ↳ Searching: "latest React 19 features"
```

**Changes needed:**
- [ ] Pass `aiActivity` to ChatMessage component
- [ ] Display below "Working on it..." text when active
- [ ] For thinking: show "Thinking..." with optional expandable content
- [ ] For searching: show "Searching: {query}"
- [ ] Subtle styling (smaller text, muted color)

---

### Task 3.5: Performance Optimization Pass

**Memoization:**
- [ ] Wrap ChatMessage with `React.memo`
- [ ] Ensure stable props (avoid inline functions/objects)
- [ ] Memoize expensive computations (suggestions parsing, etc.)

**Profiling:**
- [ ] Run Tauri dev mode with React DevTools Profiler
- [ ] Identify components re-rendering on each chunk
- [ ] Fix any O(n²) patterns in message list updates

**Virtual List (if needed):**
- [ ] If conversations > 100 messages cause lag, consider `react-window`
- [ ] Measure before implementing

---

### Task 3.6: End-to-End Testing Checklist

Manual test flow:
- [ ] User sends message → loading state appears immediately
- [ ] First chunk arrives → transitions to streaming smoothly
- [ ] Characters drain at consistent pace (no bursts)
- [ ] User scrolls up → auto-scroll stops, button appears
- [ ] User clicks scroll button → smooth scroll to bottom
- [ ] More chunks arrive → continues streaming
- [ ] Stream completes → timestamp fades in, suggestions appear
- [ ] Hover message → action bar appears
- [ ] Copy button works
- [ ] Token stats display (if available)
- [ ] Click suggestion → sends new message
- [ ] Repeat cycle works correctly

---

## Files Reference

### Modified Files
| File | Phase | Description |
|------|-------|-------------|
| `src/shared/contexts/ChatContext.tsx` | 1, 3 | Stream buffer integration, token tracking |
| `src/features/chat/hooks/useStreamBuffer.ts` | 1 | Audit and potential fixes |
| `src/features/chat/hooks/useSmartScroll.ts` | 2 | Audit and potential fixes |
| `src/features/chat/components/ChatMessage.tsx` | 1, 3 | State transitions, actions, thinking |
| `src/features/chat/components/ChatView.tsx` | 2 | Scroll handling unification |
| `src/features/chat/components/ChatPanel.tsx` | 2 | Verify scroll behavior |
| `src/features/chat/components/ChatInput.tsx` | 2 | Layout width verification |
| `src/features/chat/components/ScrollToBottomButton.tsx` | 2 | Enhanced visibility logic |
| `src/features/chat/components/AnimatedProviderIcon.tsx` | 1 | Animation verification |
| `components/CleanMarkdown.tsx` | 1 | Streaming mode validation |
| `src/shared/utils/markdownBuffer.ts` | 1 | Validation and testing |
| `index.css` | 2 | Scroll CSS optimization |

### New Files
| File | Phase | Description |
|------|-------|-------------|
| `src/features/chat/components/MessageActions.tsx` | 3 | Action bar component |
| `src/shared/utils/timeFormat.ts` | 3 | Timestamp formatting |
| `tests/unit/useStreamBuffer.test.ts` | 1 | Buffer hook tests |
| `tests/unit/markdownBuffer.test.ts` | 1 | Markdown buffer tests |

### Config Files (Reference Only)
| File | Notes |
|------|-------|
| `src/config/streaming.config.ts` | All constants already defined |
| `src/config/typography.config.ts` | Typography classes for consistency |

---

## Running Tasks

Execute tasks in order. Each task should be completable independently within its phase.

```bash
# Before starting
npm run tauri:dev  # Keep running for testing

# After each task
npm test           # Run tests
npm run build      # Verify no build errors
```

---

## Success Metrics

1. **No Jitter:** Streaming text appears character-by-character at steady pace
2. **Scroll Respect:** Manual scroll never hijacked; auto-scroll only when near bottom
3. **Visual Polish:** Clear state transitions, matching Jan app aesthetic
4. **Performance:** No lag with 50+ messages, smooth on Tauri/WebKit
5. **Token Stats:** Displays accurate (or reasonable estimate) token counts
