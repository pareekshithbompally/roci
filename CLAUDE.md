# Kasset AI — Claude Code Instructions

> **macOS meeting intelligence app — private, local-first, with built-in general-purpose AI chat**
> Tauri 2.x + React 19 + TypeScript + Vite | Multi-provider AI | ScreenCaptureKit audio | sqlite-vec RAG

**This is a pre-release app with zero existing users.** Never add migration paths, backward compatibility layers, or legacy support unless explicitly asked.

---

## Commands

```bash
npm run tauri:dev        # Full Tauri app (recommended for dev)
npm run dev              # Vite dev server (frontend only)
npm run build            # Production frontend build
npm run tauri:build      # Production Tauri app bundle (.dmg)
npm test                 # Run all tests (Vitest)
npm run test:watch       # Watch mode
npx vitest tests/unit/utils.test.ts           # Single test file
npx vitest tests/unit/utils.test.ts -t "name" # Specific test by name
```

---

## How to Work

### Investigation First, Code Second

Before proposing or writing ANY code change:

1. **Read every file you plan to modify** end-to-end. List the abstractions and patterns each file uses.
2. **Grep for prior art** — search the codebase for existing utilities, components, and design tokens related to the change.
3. **Trace the data flow** — map the call chain from entry point through the change area to downstream effects.
4. **State your understanding** — explain what you believe the root cause or correct approach is, citing specific lines.

Do not jump to a fix based on a guess. Do not propose a diagnosis without evidence. When debugging, the investigation IS the work — a correct diagnosis makes the fix obvious.

### When Implementing from a Plan

Plans live at `docs/plans/`. Each has phased implementation with verification checklists. When implementing:

1. Read the plan doc and the files it references.
2. Summarize what you will change and get approval before writing code.
3. Implement ONLY what the plan specifies — nothing extra.
4. Build and verify after each phase. Do not proceed to the next phase without confirmation.

### Principles

1. **Trace before you touch** — Map the full call chain (upstream callers -> target code -> downstream effects) before proposing any change.

2. **Single source of truth** — Every constant, type, or config defined once, imported everywhere.

3. **Respect existing abstractions** — Understand the patterns already in the codebase (event bridges, plugin boundaries, tool registry, theme tokens) and extend them. Never invent a parallel system when one exists.

4. **No hardcoded values** — Thresholds, dimensions, labels, colors, timeouts go in config/constants files. Always use `UI_CONFIG`, `SURFACE`, `BORDER`, `TEXT`, `COMPONENT` tokens. Never inline Tailwind colors or guess pixel values — look up the token.

5. **No duplication** — Before writing anything, check if it exists. Reuse utilities, components, patterns.

6. **Minimal blast radius** — Each phase ships independently. Existing functionality never breaks mid-plan.

7. **Graceful degradation** — New capabilities fail silently. Nothing new becomes a hard dependency on existing flows.

8. **No over-engineering** — No unnecessary fallbacks, safety-net wrappers, or abstractions for one-time operations. No fallback code unless the failure mode is real and demonstrated. Build for the actual scale and actual use case.

9. **Clean transitions** — State changes in UI must be smooth and consistent. Same timing, same easing, same patterns across all states.

10. **Match the codebase** — Use the project's naming conventions, file structure, import patterns, error handling style. The code should read like the existing codebase wrote it.

11. **End-to-end data flow** — For every new function, trace: who calls it, what it calls, what data flows in, what comes out, what happens on success, what happens on failure.

12. **Verification is part of the plan** — Every phase ends with a concrete checklist. Specific scenarios with expected outcomes.

---

## Architecture Overview

```
src/
├── app/                      # App bootstrap (App.tsx, AppProviders.tsx)
├── features/                  # FEATURE MODULES (use for ALL new code)
│   ├── chat/                  # Chat UI, streaming store, message components
│   ├── recording/             # Recording widget, session context, audio controls
│   ├── home/                  # Home view (idle, results, chat)
│   ├── history/               # Meeting history sidebar
│   ├── settings/              # Settings panels
│   └── layout/                # MainLayout, sidebar
├── shared/                    # Cross-feature (contexts, hooks, utils, UI primitives)
│   ├── contexts/              # AppContext, SettingsContext, HistoryContext, ChatContext, ThemeContext
│   └── ui/                    # Shared UI primitives (AlertDialog, etc.)
├── core/ai/                   # AI prompt builders, schemas, types
│   ├── prompts/               # chat.prompt.ts, entity-extraction.prompt.ts
│   └── schemas/               # transcription.schema.ts, entity-extraction.schema.ts
└── config/                    # ui.config.ts, audio.config.ts, theme.config.ts, typography.config.ts

services/                      # Business logic layer
├── unifiedAIService.ts        # AI routing to provider adapters
├── transcription.service.ts   # Post-LLM pipeline (save transcript, summary, todos, index)
├── adapters/                  # Provider adapters (OpenAI, Anthropic, Gemini, OpenAI-compat)
│   ├── types.ts               # ILLMAdapter, ToolStreamOptions, ToolChoice
│   └── tool-converter.ts      # Common tool schema → provider-specific format
├── platform-fetch.ts          # Tauri HTTP transport (CORS bypass via Rust reqwest)
├── repositories/              # Per-meeting file storage (transcript, summary, todos, notes)
└── storage/                   # Tauri filesystem, encrypted settings

extensions/
├── rag/                       # RAG system (vector search + knowledge graph)
│   ├── client.ts              # vectorDB invoke wrapper
│   ├── graph-client.ts        # graphDB invoke wrapper (planned)
│   ├── chunker.ts             # Sentence-boundary splitting, content hashing
│   ├── embeddings.ts          # Transformers.js local embedding (MiniLM)
│   ├── indexer.ts             # Meeting indexing orchestrator
│   ├── searcher.ts            # Hybrid search interface
│   ├── entity-extractor.ts    # LLM entity extraction (planned)
│   ├── consent.ts             # Model download consent bridge
│   ├── progress.ts            # Progress event bridge
│   ├── types.ts               # RAGStatus, SearchOptions, EmbeddingService
│   ├── graph-types.ts         # Entity/relationship types (planned)
│   └── constants.ts           # Named constants (planned)
├── tools/                     # LLM tool calling system
│   ├── registry.ts            # ToolRegistry singleton
│   ├── executor.ts            # ToolExecutor (never throws, returns ToolResult)
│   ├── types.ts               # ToolDefinition, ToolCall, ToolResult, ToolSchema
│   └── definitions/           # Individual tool files
│       ├── search-meetings.tool.ts
│       ├── get-meeting.tool.ts
│       ├── list-meetings.tool.ts
│       ├── get-action-items.tool.ts
│       └── query-graph.tool.ts (planned)
├── tool-orchestrator/         # Agentic tool loop (max 6 iterations)
│   ├── index.ts               # orchestrate() — provider-agnostic loop
│   ├── types.ts               # OrchestratorOptions, ToolActivity
│   └── message-buffer.ts      # Ephemeral conversation buffer
└── context-pipeline/          # @mention context resolution

src-tauri/                     # Rust backend
├── src/
│   ├── audio_core.rs          # ScreenCaptureKit audio capture
│   ├── window.rs              # Window management
│   └── shortcuts.rs           # Global shortcuts
└── plugins/
    └── tauri-plugin-vectordb/ # sqlite-vec + knowledge graph plugin
        ├── src/
        │   ├── lib.rs         # Plugin init, command registration
        │   ├── commands.rs    # Tauri commands (with_conn pattern)
        │   ├── schema.rs     # SQLite schema (meetings, chunks, FTS5, vec_chunks, kg_nodes, kg_edges)
        │   ├── search.rs     # Hybrid KNN + FTS5 + RRF search
        │   └── graph.rs      # Knowledge graph query layer (planned)
        └── Cargo.toml        # rusqlite, sqlite-vec, serde, sha2

.claude/skills/                # Custom Claude Code skills
├── implement-phase/           # /implement-phase — execute a plan phase with guardrails
└── plan/                      # /plan — write a phased implementation plan to disk
```

---

## Key Patterns

### Tool Calling System
- Tools defined in `extensions/tools/definitions/*.tool.ts` implementing `ToolDefinition`
- Registered in `extensions/tools/index.ts` via `toolRegistry.register()`
- Orchestrator runs up to 6 iterations: LLM calls tools -> executor runs -> results fed back
- System prompt in `src/core/ai/prompts/chat.prompt.ts` guides tool selection

### Event Bridge Pattern (non-React <-> React)
- `extensions/rag/progress.ts` — embedding/indexing progress events
- `extensions/rag/consent.ts` — model download consent
- Pattern: non-React code calls `emitProgress()`, React component subscribes via `onRAGProgress()`
- Single listener (not observer array), returns unsubscribe function

### Theme System
- `src/config/theme.config.ts` — `SURFACE`, `BORDER`, `TEXT`, `COMPONENT`, `RADIUS`, `SHADOW` token objects
- `src/config/ui.config.ts` — spacing, sizing, z-index, typography, radius constants
- Always use tokens, never inline Tailwind colors

### Recording Sessions
- Multi-session via `useRecordingSessions()` — only 1 active capture, unlimited review/processing
- Session lifecycle: recording -> paused -> review -> processing -> removed
- Widget renders in `App.tsx`, positioned fixed bottom-right

### Data Layer
- Per-meeting file storage: `meetings/{id}/transcript.json`, `summary.json`, `todos.json`, etc.
- Repository pattern: `services/repositories/` — one repo per document type
- Meeting index: lightweight JSON array for sidebar listing
- `transcriptionService.saveTranscriptionResult()` — atomic save with rollback on partial failure

---

## Rules

### DO
- Use `src/features/` for new functionality
- Import via path aliases (`@features/`, `@shared/`, `@config/`, `@core/`, `@extensions/`)
- Export public APIs through feature's `index.ts`
- Use npm as package manager (never pnpm)
- Use `UI_CONFIG` / theme tokens for all dimensions and colors
- Handle errors with `error: unknown` typing
- Wrap Tauri-specific code in `isTauriEnvironment()` checks
- Use isolated virtual environments for Python packages (pipx for CLI tools)

### DON'T
- Add files to legacy folders (`/components/`, `/hooks/`, `/utils/`, `/consts/`)
- Override `globalThis.fetch` in Tauri WebView — breaks Vite HMR
- Use `any` type without strong justification
- Use relative imports (`../../../`) — use path aliases
- Hardcode dimensions, colors, or thresholds inline
- Skip error handling in async functions
- Create new global state without updating `AppProviders.tsx`
- Add fallback code, legacy compatibility, or migration paths (pre-release, no users)
- Install Python packages into system Python

---

## Native ↔ Web Alignment (Tauri + macOS)

**Problem:** Native OS elements (macOS traffic lights, system toolbars) exist outside the DOM. Their positions are set by Tauri config (`trafficLightPosition`) or the OS, not CSS. You cannot inspect them with DevTools, measure them with `getBoundingClientRect()`, or see them in Playwright/browser testing. Any attempt to calculate their position from config values will fail — the mapping between config values and actual rendered coordinates depends on OS version, window style, and Tauri internals.

**Rule: Never calculate native element positions from config. Always measure empirically.**

**How to measure:** Inject fixed-position colored lines at known y-values in the Tauri app's DevTools console, then visually compare against the native element:

```js
[10, 15, 20, 25, 30, 35, 40].forEach((y, i) => {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;top:${y}px;left:0;width:250px;height:1px;background:${['red','orange','gold','green','blue','purple','magenta'][i]};z-index:99999;pointer-events:none`;
  document.body.appendChild(d);
});
```

Then calculate CSS values to place your elements at the matching y-coordinate. Clean up with:
```js
document.querySelectorAll('div[style*="z-index: 99999"]').forEach(d => d.remove());
```

**Current values (empirically measured):**
- macOS traffic light center: **y=30px** (with `trafficLightPosition: { x: 20, y: 32 }`)
- Open sidebar icons: `pt-[7px]` on header → center at y=30 (8 shell + 1 border + 7 pad + 14 btn center)
- Collapsed icons: `top-[14px]` on container → center at y=30 (14 + 16 btn center)
- Sidebar shell needs `relative z-30` to sit above the `data-tauri-drag-region` div (z-20) so buttons are clickable

**Key insight:** Playwright and browser testing are useless for native element alignment — native elements don't exist in the web layer. Always test in the actual Tauri app.

---

## Active Plans

Plans at `docs/plans/` — each with phased implementation, end-to-end data flow traces, and verification checklists:

- **RAG Hardening** (`rag-hardening-2026-03/`) — intent-aware tool routing, data integrity fixes, indexing UX, search quality
- **Recording Tray** (`recording-tray-2026-03/`) — unified tray replacing N-card widget stack
- **Knowledge Graph** (`knowledge-graph-2026-03/`) — entity extraction, graph storage in SQLite, graph query tool
