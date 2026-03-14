# Phase 6: WebCitationDrawer Component

## Overview

A slide-in drawer (identical UX pattern to `MeetingCitationDrawer`) that shows details about a web citation source. Opens when the user clicks a web citation row in the Sources tab (in ChatView only — ChatPanel opens URLs directly).

---

## 6.1 — Create WebCitationDrawer

**File:** `src/features/chat/components/WebCitationDrawer.tsx` (NEW)

```typescript
/**
 * WebCitationDrawer
 *
 * Slide-in panel that opens when user clicks a web citation in ChatView.
 * Shows source URL, title, snippet, and a link to open in browser.
 * Mirrors MeetingCitationDrawer's CSS transition pattern exactly.
 */

import React, { useCallback } from 'react';
import { X, ExternalLink, Globe } from 'lucide-react';
import { getFaviconUrl, extractDomain } from '@shared/utils/citationUtils';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { WebCitation } from '@/types';

interface WebCitationDrawerProps {
  citation: WebCitation | null;
  onClose: () => void;
}

export const WebCitationDrawer: React.FC<WebCitationDrawerProps> = ({
  citation,
  onClose,
}) => {
  const isOpen = citation !== null;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  const handleOpenInBrowser = useCallback(() => {
    if (citation) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
    }
  }, [citation]);

  return (
    <>
      {/* Backdrop — scrim + click-to-close */}
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-300 ${
          isOpen
            ? `${SURFACE.overlay} pointer-events-auto`
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`absolute right-0 inset-y-0 z-20 w-[420px] flex flex-col border-l ${BORDER.default} ${SURFACE.modal} shadow-xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Web source details"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b ${BORDER.default}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            {citation && (
              <img
                src={getFaviconUrl(citation.url, 32)}
                alt=""
                className="w-5 h-5 shrink-0 mt-0.5 rounded-sm"
                onError={(e) => {
                  // Fallback to Globe icon
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const fallback = document.createElement('span');
                    fallback.className = 'w-5 h-5 shrink-0 mt-0.5 flex items-center justify-center';
                    fallback.innerHTML = '🌐';
                    parent.insertBefore(fallback, e.target as HTMLImageElement);
                  }
                }}
              />
            )}
            <div className="min-w-0">
              <h3 className={`text-sm font-semibold ${TEXT.primary} line-clamp-2`}>
                {citation?.title || 'Web Source'}
              </h3>
              {citation && (
                <p className={`text-[11px] ${TEXT.faint} mt-0.5 truncate`}>
                  {extractDomain(citation.url)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`shrink-0 ${COMPONENT.iconButtonSm}`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {!citation ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Globe className={`w-10 h-10 ${TEXT.faint}`} />
              <p className={`text-sm ${TEXT.muted} text-center`}>No source selected</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* URL display */}
              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wide ${TEXT.faint} mb-1.5`}>
                  URL
                </p>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-sm ${TEXT.link} hover:underline break-all`}
                >
                  {citation.url}
                </a>
              </div>

              {/* Snippet (if available) */}
              {citation.snippet && (
                <div>
                  <p className={`text-[11px] font-medium uppercase tracking-wide ${TEXT.faint} mb-1.5`}>
                    Excerpt
                  </p>
                  <div className={`text-sm ${TEXT.secondary} leading-relaxed p-3 rounded-lg ${SURFACE.subtle} border ${BORDER.subtle}`}>
                    {citation.snippet}
                  </div>
                </div>
              )}

              {/* Iframe preview (optional — can be added later) */}
              {/* Commented out for now — many sites block iframe embedding
              <div>
                <p className={`text-[11px] font-medium uppercase tracking-wide ${TEXT.faint} mb-1.5`}>
                  Preview
                </p>
                <iframe
                  src={citation.url}
                  className="w-full h-[400px] rounded-lg border"
                  sandbox="allow-scripts"
                />
              </div>
              */}
            </div>
          )}
        </div>

        {/* Footer */}
        {citation && (
          <div className={`shrink-0 border-t ${BORDER.default} px-4 py-3`}>
            <button
              onClick={handleOpenInBrowser}
              className={`flex items-center gap-2 text-xs ${TEXT.link} hover:underline transition-colors`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in browser
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default WebCitationDrawer;
```

### Design notes:
- **Exact same structure** as `MeetingCitationDrawer`: backdrop, drawer panel, header, content, footer
- **Same width** (420px), same transitions (`duration-300 ease-out`)
- **Same theme tokens**: `SURFACE.modal`, `BORDER.default`, `COMPONENT.iconButtonSm`
- **No tabs** — web citations don't have transcript/summary like meetings. Just URL + snippet.
- **Iframe preview commented out** — can be enabled later if desired, but most sites block embedding.

---

## 6.2 — Integrate WebCitationDrawer into ChatView

**File:** `src/features/chat/components/ChatView.tsx`

### Add state and handlers (after the existing meeting citation state, around line 66)

```typescript
import { WebCitationDrawer } from './WebCitationDrawer';
import type { MeetingCitation, WebCitation } from '@/types';

// Inside ChatView component:

// Web citation drawer state
const [activeWebCitation, setActiveWebCitation] = useState<WebCitation | null>(null);
const handleWebCitationClick = useCallback((citation: WebCitation) => {
  setActiveWebCitation(citation);
}, []);
const handleWebDrawerClose = useCallback(() => {
  setActiveWebCitation(null);
}, []);
```

### Update ChatMessage prop (replace the Phase 4 `onWebCitationClick` handler)

In Phase 4, we initially set `onWebCitationClick` to `window.open`. Now change it to open the drawer instead:

```diff
-const handleWebCitationClick = useCallback((citation: WebCitation) => {
-  window.open(citation.url, '_blank', 'noopener,noreferrer');
-}, []);
+const handleWebCitationClick = useCallback((citation: WebCitation) => {
+  setActiveWebCitation(citation);
+}, []);
```

### Render the drawer (after MeetingCitationDrawer, around line 165)

```diff
 {/* Slide-in citation drawer — outside overflow-hidden so it's not clipped */}
 <MeetingCitationDrawer
   citation={activeCitation}
   meeting={activeMeeting}
   onClose={handleDrawerClose}
   onOpenInMain={handleOpenInMain}
 />
+<WebCitationDrawer
+  citation={activeWebCitation}
+  onClose={handleWebDrawerClose}
+/>
```

### Full ChatView return structure:

```tsx
return (
  <div className="h-full w-full">
    {/* Chat column */}
    <div className="h-full flex flex-col overflow-hidden">
      {/* Messages */}
      {/* Input */}
    </div>

    {/* Meeting citation drawer */}
    <MeetingCitationDrawer ... />

    {/* Web citation drawer */}
    <WebCitationDrawer
      citation={activeWebCitation}
      onClose={handleWebDrawerClose}
    />
  </div>
);
```

---

## 6.3 — ChatPanel (no drawer)

**File:** `src/features/chat/components/ChatPanel.tsx`

ChatPanel keeps the simple behavior from Phase 4 — clicking a web citation opens the URL directly:

```typescript
const handleWebCitationClick = useCallback((citation: WebCitation) => {
  window.open(citation.url, '_blank', 'noopener,noreferrer');
}, []);
```

**Rationale:** The sidebar is narrow (panel width). Opening a 420px drawer inside it would be cramped. Direct URL opening is the right UX for the compact layout. This mirrors how ChatPanel handles meeting citations (navigates directly, no drawer).

---

## 6.4 — Drawer Z-index Coordination

Both `MeetingCitationDrawer` and `WebCitationDrawer` use `z-10` (backdrop) and `z-20` (panel). Since only one drawer opens at a time (clicking a web citation when a meeting drawer is open would be unusual), this is fine. If both could theoretically be open:

```typescript
// Close meeting drawer when opening web drawer, and vice versa
const handleWebCitationClick = useCallback((citation: WebCitation) => {
  setActiveCitation(null);       // close meeting drawer
  setActiveWebCitation(citation); // open web drawer
}, []);

const handleCitationClick = useCallback((citation: MeetingCitation) => {
  setActiveWebCitation(null);    // close web drawer
  setActiveCitation(citation);   // open meeting drawer
}, []);
```

---

## 6.5 — Comparison: MeetingCitationDrawer vs WebCitationDrawer

| Aspect | MeetingCitationDrawer | WebCitationDrawer |
|--------|----------------------|-------------------|
| **Opens when** | Click meeting citation row | Click web citation row |
| **Header icon** | `<Mic>` | Favicon image |
| **Header title** | Meeting title | Page title or domain |
| **Header subtitle** | Date | Domain |
| **Tabs** | Transcript / Summary | None |
| **Content** | ParsedTranscript with highlight | URL + snippet |
| **Footer action** | "View full meeting" → navigates to meeting | "Open in browser" → window.open |
| **Width** | 420px | 420px |
| **Transition** | translate-x-full → translate-x-0 | Same |
| **ChatView** | Yes (drawer) | Yes (drawer) |
| **ChatPanel** | No (direct nav) | No (direct window.open) |

---

## Phase 6 Checklist

- [ ] `WebCitationDrawer.tsx` created with proper structure and styling
- [ ] Mirrors MeetingCitationDrawer's transition, sizing, and theme tokens
- [ ] ChatView integrates WebCitationDrawer with state management
- [ ] Clicking web citation in Sources tab opens the drawer (ChatView)
- [ ] Clicking web citation in Sources tab opens URL directly (ChatPanel)
- [ ] Drawer shows favicon, title, domain, URL, and snippet
- [ ] "Open in browser" footer link works
- [ ] Escape key closes the drawer
- [ ] Backdrop click closes the drawer
- [ ] Only one drawer (meeting or web) open at a time
- [ ] Existing MeetingCitationDrawer behavior unchanged
