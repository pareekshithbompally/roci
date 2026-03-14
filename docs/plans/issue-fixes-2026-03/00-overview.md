# Issue Fixes — March 2026

## Execution Order

Five phases, ordered by risk profile and file-level dependencies. Each phase is independently shippable.

| Phase | Plan | Risk | Status | Notes |
|-------|------|------|--------|-------|
| **1** | [Dark Theme & Icons](./01-dark-theme.md) | Low | **Done** | Neutral grey palette, CSS vars, glass, markdown updated. Icon step skipped (no app icon in UI). |
| **2** | [CORS / Tauri HTTP Routing](./02-cors-tauri-http.md) | **High** | **Done** | Committed `593aa09`. See plan for remaining gaps. |
| **3** | [Conversation Chain](./03-conversation-chain.md) | High | **Done** | Fixes 1-3 applied (Gemini multimodal history, Anthropic tool pairing, placeholder filter). Fix 4 deferred. |
| **4** | [Chat Scroll Behavior](./04-chat-scroll.md) | Medium | **Not started** | |
| **5** | [Menu Bar](./05-menu-bar.md) | Low | **Not started** | |

## File Overlap Map

These files are touched by multiple phases. The changes are non-conflicting (different functions/sections), but executing in the order above avoids merge friction.

| File | Phase 2 (CORS) | Phase 3 (Conv Chain) | Phase 5 (Menu) |
|------|---------------|---------------------|----------------|
| `src-tauri/src/lib.rs` | ✅ Added `.plugin(tauri_plugin_http::init())` | — | Adds `mod menu` + `.on_menu_event()` |
| `services/adapters/anthropic.adapter.ts` | ✅ Injected `fetch:` into `getClient()` | Fixes `lastToolCalls` in `chatStreamWithTools()` | — |
| `src-tauri/capabilities/default.json` | ✅ Added `http:default` permission | — | (no change needed; `core:menu:default` already present) |
| `src-tauri/Cargo.toml` | ✅ Added `tauri-plugin-http` | — | (no change needed; menu is core) |

## Key Principles

- **Package manager is npm** — `package-lock.json` is the tracked lockfile. Never use pnpm.
- **Respect existing abstractions**: Theme tokens live in `theme.config.ts`, adapter logic lives in `message-converter.ts`, scroll logic lives in the chat view components. No cross-cutting changes.
- **New dependencies**: Phase 2 added `@tauri-apps/plugin-http`, `unist-util-visit`, `highlight.js`. Phase 4 may optionally add Framer Motion if not already present. No other new deps.
- **Each phase is independently shippable** — commit and test after each.
- **Entry point chain**: `index.tsx` → `src/app/App.tsx` (wrapper with providers) → `src/App.tsx` (actual component with init logic).
- **Tauri WebView gotcha**: `globalThis.fetch` may not exist during module evaluation. Never call browser APIs at module top level — defer to runtime.
