# Roci — Claude Code Instructions

> **Apple-platforms (macOS, iOS, iPadOS) meeting-intelligence app — private, local-first, with built-in AI chat.**
> Tauri 2.x + React 19 + TS + Vite | Vercel AI SDK (multi-provider) | Rust Core Audio tap + cpal audio | sqlite-vec RAG
> **Pre-release, zero users.** Never add migrations, backward-compat, or legacy support unless explicitly asked.

---

## Commands

```bash
npm run tauri:dev     # Full app (dev)            npm test            # Vitest
npm run build         # Frontend build (esbuild)  npm run test:watch  # Watch
npm run tauri:build   # .dmg bundle               npx tsc --noEmit    # Typecheck gate
npx vitest tests/unit/x.test.ts -t "name"         # Single test
```

---

## INVARIANTS

These are hard constraints. They **override** convenience, speed, and your defaults. Violating one is a defect, not a style choice. If a task seems to require breaking one, stop and say so — do not break it silently.

### I1 — No custom one-off code. Compose from shared primitives.
- UI is built from `src/shared/ui/` (Radix primitives) and `src/shared/components/`. Before writing a component, grep for an existing one. If a primitive almost fits, extend it — never fork a parallel copy.
- Logic lives in `services/`, `extensions/`, and feature hooks. Reuse `shared/utils/` and feature hooks before adding code.
- A second implementation of an existing capability is a bug. Single source of truth, imported everywhere.

### I2 — State: Zustand for client, TanStack Query for disk/server. Nothing else.
- **Client/UI state → Zustand with per-slice selectors** (`appStore`, `useLeftPanel`, `useRightPanel`, `streamingStore`). Subscribe to one slice per hook (`useStore(s => s.x)`). Select actions individually so refs stay stable. **Never** return a fresh object/array from a selector without `useShallow` — it re-renders on every change.
- **Disk/server state → TanStack Query** (`useMeetingNotes`, `useMeetingTodos`, `useGlobalTodos`). Keys come from the `@shared/query/queryKeys` factory only — no inline key literals. Every mutation is optimistic: `cancelQueries` → snapshot `previous` → `setQueryData` → `onError` rollback → `onSettled` invalidate. The `cancelQueries` step is mandatory.
- Non-React code invalidates via the singleton `@shared/query/queryClient` (e.g. `todoProposalStore`). No window/custom events for cross-store sync.
- **New React Context is the exception, not the default.** Allowed only for genuine dependency-injection (theme, settings, toast, history). If you reach for Context to share mutable state, you want a store or a query instead.

### I3 — Design system via tokens. Zero hardcoded values.
- One-way contract: **tokens** (`src/styles/tokens.css`, light + `.dark`) → **config** (`tailwind.config.js` role utilities, `src/config/*.config.ts`) → **kit** (`@shared/ui`, barrel only) → `@shared/components` → **features**. A layer imports only from layers below it.
- **Features only arrange kit parts.** They pass kit props (`variant`, `size`, `tone`, `edge`…) and write layout utilities (flex/grid/gap/width/position). They **never** write colour, font-size, radius, border, shadow, `dark:` or `[px]` classes, hex, raw `<button>/<input>/<textarea>`, Radix imports, or `@config/typography` imports.
- Kit almost fits → add a variant/prop in `src/shared/ui` once. Never override with `className`, never hand-roll in a feature.
- Spacing, sizing, z-index, timeouts, thresholds → `src/config/*.config.ts` (`UI_CONFIG`, etc.). No magic numbers. CSS files read colours from token vars only.
- Sole exception: `src/features/home/components/LandingGlow.tsx` (brand gradient) and dot-scope shader data in `dotScope.config.ts`.

### I4 — AI access goes through the Vercel AI SDK abstraction. No raw provider SDKs.
- All models are created by `services/ai/provider.ts` `createModel()` → AI SDK `LanguageModel`. Add providers there, behind the existing `ResolvedModel` mapping — never call OpenAI/Anthropic/etc. SDKs directly from features.
- HTTP flows through `@tauri-apps/plugin-http` (Rust reqwest, CORS bypass) via the SDK `fetch:` param. **Never** override `globalThis.fetch` — it breaks Vite HMR.
- Tools, intent classification, and synthesis go through `extensions/tools/` + `extensions/tool-orchestrator/`. Extend the registry; don't bolt on a parallel tool path.

### I5 — Native macOS code: audio and permissions are a frozen Rust core; calendar is a Swift bridge.
- **Audio capture** (`src-tauri/src/audio/`) and **permissions** (`src-tauri/src/permissions/`) are a proven, frozen Rust core (cpal, objc2 Core Audio process tap, ScreenCaptureKit fallback). Change them only when explicitly asked, following the local recording-audio plan in `docs/plans/`; no rewrites.
- **Calendar** stays a Swift bridge: `tauri-plugin-calendar`'s `CalendarBridge` (`@_cdecl` ⇄ `extern "C"`, `{"ok":bool,"error":?}` JSON C-string freed via the paired `*_free_string`). Mirror that pattern for new native work the Rust core doesn't cover.

### I6 — Rust/Tauri: compiles clean, permissions declared, OS prompts handled natively.
- `src-tauri` must `cargo build` with no errors and no new warnings. Treat a warning you introduced as a failure.
- Any Tauri API a feature calls must be allow-listed in `src-tauri/capabilities/desktop.json` (macOS) and/or `mobile.json` (iOS / iPadOS), per the platforms that call it. Adding an `invoke`/plugin call without its permission is incomplete.
- Permission strings (`NS*UsageDescription`): macOS in `src-tauri/Info.plist`, iOS wording in `src-tauri/Info.ios.plist` (merged on top of `Info.plist` for iOS). Adding a capability that touches mic/screen/calendar/etc. **requires** its usage string on every platform that uses it.
- Request OS permission the **native** way, at the point of use — let the system framework raise the prompt (e.g. `SCShareableContent.getWithCompletionHandler` triggers Screen Recording; `AVCaptureDevice`/EventKit `requestAccess` for mic/calendar). Handle denial as an expected, recoverable state surfaced to the UI — never crash, never silently no-op.

### I7 — Clean code: minimal cognitive & cyclomatic complexity.
- ≤10 cyclomatic complexity per function; prefer ≤5. One job per function, one reason to change per module. Flatten nesting (early return > pyramids).
- No speculative abstraction, no safety-net wrapper, no fallback path unless the failure mode is real and demonstrated. Delete dead code on sight rather than commenting it out.
- Errors typed `unknown`; handle every async rejection. Match existing naming, structure, and error style.

### I8 — No legacy, migration, fallback, or backward-compat code. (Pre-release, no users.)

### I9 — Structure & imports are fixed.
- New code goes in `src/features/<feature>/`; export the public API via the feature `index.ts`.
- Path aliases only — `@features/ @shared/ @config/ @core/ @extensions/ @services/ @platform/`. **No** `../../../` relative imports. Type-only imports use `import type`.
- Never add to legacy folders (`/components`, `/hooks`, `/utils`, `/consts`). npm only — never pnpm. Wrap native calls in `isTauriEnvironment()`.

### I10 — Native events, never polling. (macOS today, iOS next.)
- **Never read OS state on an interval.** When macOS/iOS offers a change notification or listener, subscribe to it: Core Audio property listeners (mic / process activity), `EKEventStoreChanged` (calendar), `NSWorkspace.didWakeNotification` + `NSSystemClockDidChange` (sleep / clock), `NSApplication.didBecomeActiveNotification` (re-check permissions on return from System Settings).
- **Time-based work** = one timer armed for the next deadline, or an OS-scheduled notification (`UNNotificationRequest` triggers). Re-arm when the event that set it changes. No fixed-rate ticks.
- **Shape:** OS event → state → effect. A native bridge that receives an event pushes it on (callback / Tauri event); it never bumps a counter for someone else to poll. The frontend listens to Rust events — no `setInterval`/`refetchInterval` over native state.
- **Only visible clocks tick**, and only while visible (e.g. the recording timer while recording). The frozen audio capture loops (I5) are exempt.

---

## How to Work

**Investigate first, code second.** Before changing anything:
1. **Read** every file you'll modify, end to end. Name the patterns each uses.
2. **Grep for prior art** — utilities, components, tokens, hooks that already solve part of it.
3. **Trace the data flow** — upstream callers → target → downstream effects.
4. **State the root cause** with evidence (cite `file:line`). A correct diagnosis makes the fix obvious. No guess-fixes.

**Implementing a plan** (`docs/plans/`): read the plan + referenced files, summarize what you'll change and get approval, implement **only** what's specified, build + verify after each phase, don't advance without confirmation.

**Chat in plain English. Detail goes in docs.** Console logs use `[ComponentName] message:`, value.

---

## Architecture Map

```
src/
  app/            App bootstrap (App.tsx, AppProviders.tsx — provider tree)
  features/       Feature modules — ALL new UI code (calendar chat history home
                  import layout notes recording settings summary todos transcription)
  shared/
    stores/       Zustand (appStore + panel/streaming stores)   ui/  Radix primitives
    query/        queryClient + queryKeys factory               components/  shared UI
    contexts/     DI-only contexts (Theme Settings Toast History …)
    hooks/ utils/ types/
  core/ai/        prompts, Zod schemas, requestBuilder, temporal, types
  config/         *.config.ts — theme + UI + domain tokens (single source of truth)
services/
  ai/             Vercel AI SDK layer (provider.ts createModel, message-converter, tools-bridge)
                  transcription/  engine registry (ENGINES) + analyze.ts + cred/format helpers
  repositories/   Per-meeting file storage (BaseRepository readJson/writeJson)
  transcription.service.ts  unifiedAIService.ts  platform-fetch.ts  reminder.service.ts
extensions/
  rag/            sqlite-vec embeddings + hybrid search
  tools/          LLM tool registry + executor      tool-orchestrator/  intent→retrieval→synthesis
src-tauri/
  src/audio/      capture: supervisors, process tap, mic, tracks, mixdown   src/permissions/  consent checks
  src/            lib.rs window.rs shortcuts.rs screenshot.rs wake_lock.rs
  capabilities/   desktop.json + mobile.json (permission allowlists)   Info.plist (NS*UsageDescription)
  plugins/        tauri-plugin-{store,calendar}
```

**Data layout** (`~/Library/Application Support/ai.roci.roci/`): `meetings/{id}/{transcript,summary,todos,notes,recording-meta}.json` + `meetings/index.json`; `chats/{sessionId}.json` + `chats/index.json`; `recordings/*.wav`; `vectordb.sqlite`; `settings.json` (API keys AES-256-GCM).

**Transcription pipeline** — two clearly separated stages with their own model settings:
- `transcriptionModel` (STT engine ID: `whisper-1`, `groq-whisper`, `deepgram`, `elevenlabs`, `gemini`) → fills the **Transcript** tab with verbatim STT output.
- `analyzeModel` (any text LLM) → fills the **Overview** tab with structured `MeetingSummary`.
- Engines registered in `services/ai/transcription/engines.ts` (`ENGINES` map). Adding an engine = one entry.
- Gemini is the only multimodal engine (`viaMultimodal`); all others use `experimental_transcribe()` via the AI SDK.
- No provider `if/else` forks. `unifiedAIService.transcribeAudio()` does a single engine-registry lookup; `analyzeTranscript()` is generic.

**Native ↔ web alignment:** never compute native element positions from config — measure empirically (see AGENTS.md). macOS traffic-light center: y=30px.

---

## Verification Gates (every change must pass)

1. `npx tsc --noEmit` — must not exceed the known baseline error count. New errors = fail.
2. `npm run build` succeeds.
3. Touched Rust → `cargo build` clean, no new warnings; new Tauri calls have capability + (if native) Info.plist string.
4. `npm run audit:design` — every row 0 except the LandingGlow rows (`raw_tailwind_hues`, `px_outside_config`, `dark_variants`, `role_classes_in_features`); `unused_locals` 0; `colour_literal_files` 0. Then grep your diff: no magic numbers (I3); no `../` imports (I9); no `globalThis.fetch` (I4); no raw provider SDK (I4); no selector returning a fresh object without `useShallow` (I2); no mutation missing `cancelQueries` (I2).
5. Every new function: who calls it, what it calls, data in/out, success path, failure path.
