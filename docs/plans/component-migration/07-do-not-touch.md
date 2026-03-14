# Do Not Touch: Protected Components

These components are explicitly excluded from the Radix migration. They are
either performance-critical, domain-specific, or already well-solved by their
current implementation. Migrating them would introduce risk with no benefit.

---

## Chat Pipeline (CRITICAL — zero changes)

| Component | Path | Why Protected |
|---|---|---|
| ChatView | `src/features/chat/components/ChatView.tsx` | Full-screen chat with scroll management (`use-stick-to-bottom`), message rendering, buffer drain logic. Touching this risks scroll jank and streaming regressions. |
| ChatPanel | `src/features/chat/components/ChatPanel.tsx` | Sidebar chat mirror — shares ChatMessage/ChatInput. Same risks. |
| ChatMessage | `src/features/chat/components/ChatMessage.tsx` | Message rendering with Streamdown, avatar, metadata. Complex state machine (streaming → complete). |
| ChatInput | `src/features/chat/components/ChatInput.tsx` | Textarea with auto-resize, keyboard shortcuts, mention detection, file attachment. Keyboard handling is intricate and tested. |
| StreamingStore | `src/features/chat/stores/streamingStore.ts` | External store via `useSyncExternalStore`. Isolates streaming re-renders. Do not wrap in any new context or provider. |
| Streamdown renderer | Uses `@janhq/streamdown` | Third-party streaming markdown renderer. Styled via `src/styles/markdown.css`. Never switch renderers between streaming/complete states. |

**Why**: The chat pipeline was carefully tuned for Jan AI-quality streaming:
no jitter, no frame refresh on completion, identical rendering between
streaming and complete states. Any change risks breaking this.

---

## Recording System

| Component | Path | Why Protected |
|---|---|---|
| RecordingWidget | `src/features/recording/components/RecordingWidget.tsx` | Minimized recording bar — custom UI with waveform. Domain-specific, not a generic UI pattern. |
| RecordingContext | `src/features/recording/context/RecordingContext.tsx` | Recording state machine. No UI primitives involved. |
| CustomAudioPlayer | `components/CustomAudioPlayer.tsx` | Waveform audio player — custom canvas rendering. Not a form control. |

**Why**: Recording components are domain-specific widgets with custom
visualizations. They don't use dropdown/modal/select patterns.

---

## Download & Progress System

| Component | Path | Why Protected |
|---|---|---|
| DownloadBanner | `src/shared/components/DownloadBanner.tsx` | Floating progress banner for llama.cpp downloads. Uses framer-motion for animations. Works well as-is. |
| downloadStore | `extensions/llamacpp/downloadStore.ts` | External store for download state. No UI primitives. |
| ModelBrowser | `extensions/llamacpp/components/ModelBrowser.tsx` | Custom HuggingFace model browser. Domain-specific. |

**Why**: These are custom domain widgets, not generic UI primitives.
The DownloadBanner is intentionally a non-modal floating element.

---

## Toast System

| Component | Package | Why Protected |
|---|---|---|
| Toaster (sonner) | `sonner` | Already a production-quality toast library. shadcn/ui itself uses sonner. No reason to replace. |
| ToastContext | `src/shared/contexts/ToastContext.tsx` | Thin wrapper around sonner. Works fine. |

**Why**: sonner is the correct choice. It's what shadcn/ui uses. No migration.

---

## Layout System

| Component | Path | Why Protected |
|---|---|---|
| ResizablePanel | `components/ui/resizable.tsx` | Thin wrapper around `react-resizable-panels`. Already properly abstracted. |
| MainLayout | `src/features/layout/components/` | App shell with sidebar + main area. Not a generic UI primitive. |
| Surface | `src/shared/components/Surface.tsx` | Utility wrapper for surface styling. Already thin. |

**Why**: Layout components are app-specific and don't benefit from Radix.
The resizable panel wrapper is already the right abstraction.

---

## Settings Primitives (keep existing, add Radix alongside)

| Component | Path | Status |
|---|---|---|
| SettingsSection | `shared/SettingsSection.tsx` | Keep — layout wrapper, not a UI primitive |
| SettingsInput | `shared/SettingsInput.tsx` | Keep — works well, no Radix equivalent needed |
| SecretInput | `shared/SecretInput.tsx` | Keep — wraps SettingsInput, no change needed |
| RadioCard | `shared/RadioCard.tsx` | Keep — custom card-style radio, no direct Radix match |
| InfoCallout | `shared/InfoCallout.tsx` | Keep — simple layout component |
| ModelListItem | `shared/ModelListItem.tsx` | Keep — domain-specific list item |
| QualityPresetSelector | `QualityPresetSelector.tsx` | Keep — custom 4-card grid, domain-specific |
| SettingsSaveButton | `SettingsSaveButton.tsx` | Keep — custom sticky save button with framer-motion |

**Why**: These are well-built settings-specific layout components. They don't
have click-outside, keyboard nav, or focus management concerns that Radix
solves. They use theme tokens correctly. No benefit to migrating.

The only settings primitive that migrates is **Toggle → Switch** (Phase 3),
because Radix Switch provides proper accessibility (ARIA, focus ring,
keyboard) that the current custom implementation lacks.

---

## CSS & Styling

| File | Why Protected |
|---|---|
| `src/styles/markdown.css` | Chat markdown styling. Complex, carefully tuned. |
| `src/styles/glass.css` | macOS vibrancy effects. Platform-specific. |
| `src/styles/syntax-highlight.css` | Shiki code highlighting overrides. |
| `src/config/theme.config.ts` | Design token source of truth. Phase 1 adds CSS variable bridge alongside it — does NOT modify it. |
| `src/config/typography.config.ts` | Typography tokens. Unchanged. |

---

## Summary: What Changes vs What Doesn't

```
CHANGES (Phases 3-6):
  ├── 2 native <select> → Radix Select
  ├── 1 custom Toggle → Radix Switch (via wrapper)
  ├── 4 hand-rolled modals → Radix Dialog / AlertDialog
  ├── 2 hand-rolled dropdowns → Radix Popover + Command
  ├── 1 search overlay → CommandDialog
  └── 1 settings search dropdown → Radix Popover + Command

DOES NOT CHANGE:
  ├── Chat pipeline (6 components + store)
  ├── Recording system (3 components)
  ├── Download system (3 components)
  ├── Toast system (sonner)
  ├── Layout system (3 components)
  ├── 8 settings primitives
  ├── All CSS files
  └── All config files (theme, typography, audio)
```
