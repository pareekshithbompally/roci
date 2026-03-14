# Phase 4: Extend Sources Tab for Web Citations

## Overview

The existing `ActionBarWithTabs` in `ChatMessage.tsx` has a "Sources" tab that shows meeting citations. This phase extends it to also display web citations — each rendered as a row with a favicon, title, and domain.

---

## 4.1 — Update ChatMessage Props

**File:** `src/features/chat/components/ChatMessage.tsx`

### Add new prop types (around line 25)

Add the import for `WebCitation`:

```diff
-import type { ChatPart, MeetingCitation } from '@/types';
+import type { ChatPart, MeetingCitation, WebCitation } from '@/types';
```

### Extend ChatMessageProps (lines 27-53)

Add `webCitations` to props:

```diff
 interface ChatMessageProps {
   // ... existing fields ...
   toolActivity?: {
     calls: Array<{ toolName: string; executionMs: number; resultSummary?: string }>;
     totalIterations: number;
     citations?: MeetingCitation[];
   };
   preparingTools?: boolean;
   onCitationClick?: (citation: MeetingCitation) => void;
+  /** Web search citations (URLs, titles) */
+  webCitations?: WebCitation[];
+  /** Called when user clicks a web citation */
+  onWebCitationClick?: (citation: WebCitation) => void;
 }
```

### Pass new props through ChatMessage component (lines 251-271)

Add the new props to the destructuring and pass them to `ActionBarWithTabs`:

```diff
 export const ChatMessage: React.FC<ChatMessageProps> = memo(({
   // ... existing ...
   toolActivity,
   preparingTools = false,
   onCitationClick,
+  webCitations,
+  onWebCitationClick,
 }) => {
```

### Update memo comparison (lines 382-396)

Add the new props to the comparison function:

```diff
 }, (prev, next) => {
   if (prev.state !== next.state) return false;
   if (next.state === 'streaming') return true;
   return (
     prev.text === next.text &&
     prev.parts === next.parts &&
     prev.isCopied === next.isCopied &&
     prev.isLastMessage === next.isLastMessage &&
     prev.tokenCount === next.tokenCount &&
     prev.toolActivity === next.toolActivity &&
     prev.toolActivity?.citations === next.toolActivity?.citations &&
     prev.preparingTools === next.preparingTools &&
-    prev.onCitationClick === next.onCitationClick
+    prev.onCitationClick === next.onCitationClick &&
+    prev.webCitations === next.webCitations &&
+    prev.onWebCitationClick === next.onWebCitationClick
   );
 });
```

---

## 4.2 — Update ActionBarWithTabs

**File:** `src/features/chat/components/ChatMessage.tsx` (inline component)

### Add to ActionBarWithTabs props (lines 135-148)

```diff
 const ActionBarWithTabs: React.FC<{
   // ... existing ...
   onCitationClick?: (citation: MeetingCitation) => void;
+  webCitations?: WebCitation[];
+  onWebCitationClick?: (citation: WebCitation) => void;
 }> = ({
   id, text, timestamp, isCopied, onCopy, onRerun, isLastMessage,
   toolActivity, tokensPerSecond, tokenCount,
   suggestions, onSuggestionClick, onCitationClick,
+  webCitations, onWebCitationClick,
 }) => {
```

### Update hasCitations / hasTabs logic (lines 154-156)

```diff
 const hasSuggestions = !!(suggestions && suggestions.length > 0 && onSuggestionClick && isLastMessage);
-const hasCitations = !!(toolActivity?.citations && toolActivity.citations.length > 0);
+const hasMeetingCitations = !!(toolActivity?.citations && toolActivity.citations.length > 0);
+const hasWebCitations = !!(webCitations && webCitations.length > 0);
+const hasCitations = hasMeetingCitations || hasWebCitations;
 const hasTabs = hasSuggestions || hasCitations;
```

### Add citation utility import

At the top of the file:

```typescript
import { getFaviconUrl, extractDomain } from '@shared/utils/citationUtils';
```

### Extend the Sources tab content (lines 236-245)

Replace the existing sources rendering block with one that shows both meeting and web citations:

```typescript
{activeTab === 'sources' && hasCitations && (
  <>
    {/* Meeting citations */}
    {hasMeetingCitations && toolActivity!.citations!.map((citation) => (
      <div key={citation.meetingId} onClick={() => onCitationClick?.(citation)} className={rowClass}>
        <Mic className="w-3.5 h-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
        <span className="font-medium truncate">{citation.meetingTitle}</span>
        <span className="ml-auto text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
          {new Date(citation.meetingTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    ))}

    {/* Web citations */}
    {hasWebCitations && webCitations!.map((citation, i) => (
      <div
        key={`web-${i}-${citation.url}`}
        onClick={() => onWebCitationClick?.(citation)}
        className={rowClass}
      >
        <img
          src={getFaviconUrl(citation.url)}
          alt=""
          className="w-3.5 h-3.5 shrink-0 rounded-sm"
          loading="lazy"
          onError={(e) => {
            // Fallback: hide broken favicon
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="font-medium truncate">{citation.title || extractDomain(citation.url)}</span>
        <span className="ml-auto text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 truncate max-w-[120px]">
          {extractDomain(citation.url)}
        </span>
      </div>
    ))}
  </>
)}
```

### Visual design notes

- Web citation rows use the same `rowClass` as meeting citations for consistency
- Favicon: 16px via Google's service, `rounded-sm` for subtle rounding, `loading="lazy"`
- Fallback: if favicon fails to load, hide the `<img>` entirely
- Right side shows domain name (instead of date for meeting citations)
- Title fallback: if `citation.title` is empty, show the domain

---

## 4.3 — Update ActionBarWithTabs Invocation (line 320)

Pass the new props:

```diff
 <ActionBarWithTabs
   id={id}
   text={text}
   timestamp={timestamp}
   isCopied={isCopied}
   onCopy={onCopy}
   onRerun={onRerun}
   isLastMessage={isLastMessage}
   toolActivity={toolActivity}
   tokensPerSecond={tokensPerSecond}
   tokenCount={tokenCount}
   suggestions={suggestions}
   onSuggestionClick={onSuggestionClick}
   onCitationClick={onCitationClick}
+  webCitations={webCitations}
+  onWebCitationClick={onWebCitationClick}
 />
```

---

## 4.4 — Update ChatView.tsx

**File:** `src/features/chat/components/ChatView.tsx`

### Add web citation click handler (after line 65)

```typescript
const handleWebCitationClick = useCallback((citation: WebCitation) => {
  // Open URL in new tab (or could open WebCitationDrawer — Phase 6)
  window.open(citation.url, '_blank', 'noopener,noreferrer');
}, []);
```

Import `WebCitation`:

```diff
-import type { MeetingCitation } from '@/types';
+import type { MeetingCitation, WebCitation } from '@/types';
```

### Pass to ChatMessage (around line 128)

```diff
 <ChatMessage
   // ... existing props ...
   onCitationClick={handleCitationClick}
+  webCitations={message.webCitations}
+  onWebCitationClick={handleWebCitationClick}
 />
```

---

## 4.5 — Update ChatPanel.tsx

**File:** `src/features/chat/components/ChatPanel.tsx`

### Add web citation click handler (after line 56)

```typescript
const handleWebCitationClick = useCallback((citation: WebCitation) => {
  window.open(citation.url, '_blank', 'noopener,noreferrer');
}, []);
```

Import `WebCitation`:

```diff
-import type { MeetingCitation } from '@/types';
+import type { MeetingCitation, WebCitation } from '@/types';
```

### Pass to ChatMessage (around line 227)

```diff
 <ChatMessage
   // ... existing props ...
   onCitationClick={handleCitationClick}
+  webCitations={message.webCitations}
+  onWebCitationClick={handleWebCitationClick}
 />
```

---

## Phase 4 Result Preview

After this phase, the Sources tab looks like:

```
┌──────────────────────────────────────────────┐
│  [ Suggestions ]  [ Sources ]                │
├──────────────────────────────────────────────┤
│  🎤 Weekly Standup Meeting    Feb 24         │  ← meeting citation
│  🌐 docs.python.org          docs.python.org│  ← web citation
│  🌐 Stack Overflow answer    stackoverflow…  │  ← web citation
└──────────────────────────────────────────────┘
```

(Where 🎤 = Mic icon, 🌐 = favicon image)

---

## Phase 4 Checklist

- [ ] Import `WebCitation` and `citationUtils` in ChatMessage.tsx
- [ ] Add `webCitations?` and `onWebCitationClick?` to `ChatMessageProps`
- [ ] Update `ActionBarWithTabs` to render web citations in Sources tab
- [ ] Favicon images load via Google S2 service with error fallback
- [ ] Domain extraction shows clean hostname
- [ ] ChatView passes `webCitations` and `onWebCitationClick` to ChatMessage
- [ ] ChatPanel passes `webCitations` and `onWebCitationClick` to ChatMessage
- [ ] Sources tab shows when either meeting OR web citations exist
- [ ] Visual consistency: web citation rows match meeting citation row styling
- [ ] Memo comparison updated to include new props
