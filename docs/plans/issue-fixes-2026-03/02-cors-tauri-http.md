# Phase 2: CORS Fix — Route HTTP Through Tauri's Native Client

## Status: DONE (with gaps)

Committed in `593aa09`. All steps implemented and verified.

## What Was Done

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add `tauri-plugin-http` to Cargo.toml | ✅ Done (no version bump needed — `@tauri-apps/api@^2.9.1` resolved to 2.10.1 which satisfies plugin-http's requirement) |
| 2 | Register plugin in `lib.rs` + add `http:default` permission in `default.json` | ✅ Done |
| 3 | Create `services/platform-fetch.ts` | ✅ Done (with critical fixes, see below) |
| 4 | Bootstrap `initPlatformFetch()` in `src/App.tsx` | ✅ Done |
| 5 | Inject `fetch: getPlatformFetch()` into SDK constructors | ✅ Done for OpenAI, Anthropic, openai-compat adapters + `providers/default.ts` |
| 6 | `clearClientCache()` in `initPlatformFetch()` | ✅ Done |
| 7 | Cleanup (optional) | ❌ Not done — `anthropic-dangerous-direct-browser-access` header still in `consts/providers.ts` |

## Critical Implementation Differences From Original Plan

### 1. No `globalThis.fetch` override

The original plan called for `globalThis.fetch = tauriFetch` to support Google GenAI SDK (which doesn't accept a `fetch:` parameter). **This breaks the Tauri WebView** — Vite HMR, module loading, and internal browser APIs all depend on the native fetch. Overriding it makes the app render but become frozen/non-interactive.

**Current state:** `globalThis.fetch` is NOT overridden. Only SDK constructors that accept `fetch:` use the Tauri fetch.

### 2. No module-level `globalThis.fetch.bind()`

The original plan had `let _fetch = globalThis.fetch.bind(globalThis)` at module top level. **This crashes silently** in the Tauri WebView because `globalThis.fetch` may not exist during module evaluation (before the Tauri bridge injects it). The crash kills the entire module graph and React never renders — producing a black screen with no errors.

**Current state:** `_fetch` is initialized to `null` and set at runtime inside `initPlatformFetch()`.

### 3. `initPlatformFetch()` wrapped in try/catch

The call in `src/App.tsx` is wrapped in its own try/catch so that a failure doesn't block `initializeStorage()`, `runMigrations()`, and other critical init steps. If platform fetch fails, the app falls back to native browser fetch.

## Remaining Gaps

### Gap 1: Google GenAI SDK (Gemini) — NOT routed through Tauri HTTP

The Gemini adapter (`services/adapters/gemini.adapter.ts`) uses the `@google/genai` SDK which does NOT accept a `fetch:` parameter. Gemini API calls still go through the browser's native fetch.

**Impact:** Low — Google's API currently sends CORS headers, so Gemini works. If Google ever removes CORS support, this would break.

**Possible fix:** Create a wrapper around Gemini API calls that uses `getPlatformFetch()` for the raw HTTP layer, bypassing the SDK's internal fetch. Or intercept only Gemini-bound requests with a scoped fetch proxy. Do NOT override `globalThis.fetch`.

### Gap 2: Anthropic `custom_header` cleanup not done

`consts/providers.ts` still has the `anthropic-dangerous-direct-browser-access` header. This was a browser CORS workaround that's now unnecessary with Tauri HTTP routing. Low priority — it doesn't cause harm, just dead config.

## Verification Checklist

| Test | Expected | Verified |
|------|----------|----------|
| `cargo build` in `src-tauri/` | Compiles | ✅ |
| `npm run tauri:dev` | App boots, no black screen | ✅ |
| Mistral chat | Streams correctly (was broken) | ❓ Needs testing |
| Groq chat | Streams correctly (was broken) | ❓ Needs testing |
| OpenAI chat | Still works (regression check) | ❓ Needs testing |
| Anthropic chat | Still works (regression check) | ❓ Needs testing |
| Gemini chat | Still works (regression check) | ❓ Needs testing |
| Settings → Model discovery for Mistral | Shows model list (was broken) | ❓ Needs testing |
| Settings → Model discovery for Groq | Shows model list (was broken) | ❓ Needs testing |

## Lessons Learned

1. **Never call browser APIs at module top level in Tauri** — `globalThis.fetch`, `window.navigator`, etc. may not exist during ESM module evaluation in the WebView.
2. **Never override `globalThis.fetch`** — breaks WebView internals (Vite HMR, CSS loading, dynamic imports).
3. **Use npm, not pnpm** — `package-lock.json` is the tracked lockfile. Using pnpm creates a separate `pnpm-lock.yaml` and resolves dependencies differently.
4. **When adding Tauri plugins**: add the JS package with `npm install`, add the Rust crate to `Cargo.toml`, run `cargo check` (not `cargo update`) to add just the new dep without bumping everything else.
5. **Incremental testing**: when debugging a black screen, bisect by reverting to known-good state and re-applying changes one group at a time (packages → Rust → TypeScript).
