# Kasset AI — Claude Code Instructions

> **macOS meeting intelligence app — private, local-first, with built-in general-purpose AI chat**
> Tauri 2.x + React 19 + TypeScript + Vite | Multi-provider AI (Vercel AI SDK) | ScreenCaptureKit audio | sqlite-vec RAG + Knowledge Graph

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
npm run test:coverage    # Coverage report
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

1. **Trace before you touch** — Map the full call chain (upstream callers → target code → downstream effects) before proposing any change.
2. **Single source of truth** — Every constant, type, or config defined once, imported everywhere.
3. **Respect existing abstractions** — Understand the patterns already in the codebase (event bridges, plugin boundaries, tool registry, theme tokens) and extend them. Never invent a parallel system when one exists.
4. **No hardcoded values** — Thresholds, dimensions, labels, colors, timeouts go in config/constants files. Always use `UI_CONFIG`, `SURFACE`, `BORDER`, `TEXT`, `COMPONENT` tokens. Never inline Tailwind colors or guess pixel values — look up the token.
5. **No duplication** — Before writing anything, check if it exists. Reuse utilities, components, patterns.
6. **Minimal blast radius** — Each phase ships independently. Existing functionality never breaks mid-plan.
7. **Graceful degradation** — New capabilities fail silently. Nothing new becomes a hard dependency on existing flows.
8. **No over-engineering** — No unnecessary fallbacks, safety-net wrappers, or abstractions for one-time operations. No fallback code unless the failure mode is real and demonstrated.
9. **Clean transitions** — State changes in UI must be smooth and consistent. Same timing, same easing, same patterns across all states.
10. **Match the codebase** — Use the project's naming conventions, file structure, import patterns, error handling style.
11. **End-to-end data flow** — For every new function, trace: who calls it, what it calls, what data flows in, what comes out, what happens on success, what happens on failure.
12. **Verification is part of the plan** — Every phase ends with a concrete checklist. Specific scenarios with expected outcomes.

---

## Architecture Overview

```
src/
├── app/                      # App bootstrap (App.tsx, AppProviders.tsx)
├── features/                  # FEATURE MODULES (use for ALL new code)
│   ├── calendar/              # Week view calendar (Schedule-X), event popovers
│   ├── chat/                  # AI chat: streaming, multimodal, tool calls, citations
│   ├── history/               # Meeting history sidebar, search, rename, delete
│   ├── home/                  # Home view router (idle → chat → results)
│   ├── import/                # Audio/transcript file import with job queue
│   ├── layout/                # MainLayout with resizable sidebar + chat panel
│   ├── notes/                 # Per-meeting notes CRUD
│   ├── recording/             # Audio capture controls, sessions, timer, source selection
│   ├── settings/              # 7-panel settings (Audio, Providers, Local Inference, Categories, Integrations, Usage, Interface)
│   ├── summary/               # Summary display (re-exports from components)
│   ├── todos/                 # Todo management with priorities, due dates, reminders
│   └── transcription/         # Transcript views (re-exports from components)
├── shared/
│   ├── contexts/              # AppContext, ChatContext, HistoryContext, MeetingContext, SettingsContext, ThemeContext, ToastContext, UnsavedChangesContext
│   ├── hooks/                 # useAppShortcuts, useCalendarIntegration, useLeftPanel, useRightPanel, useMediaQuery, useUnifiedSidebar, useTranscribeRecording, useTheme, useClickOutside, useDebounce
│   ├── components/            # ActivityTray, SearchOverlayDialog, ModelDownloadModal, Surface, CodeBlock, UnsavedChangesModal
│   ├── ui/                    # Radix primitives (AlertDialog, Command, DatePicker, Dialog, DropdownMenu, Popover, Select, Switch)
│   └── utils/                 # async.utils, text.utils, todo.utils, formatters, validators, modelResolver, citationUtils, markdownBuffer, toolUtils, inlineCitationInjector
├── core/ai/
│   ├── prompts/               # chat.prompt, transcription.prompt, document.prompt, entity-extraction.prompt
│   ├── schemas/               # transcription.schema, entity-extraction.schema (Zod)
│   ├── types.ts               # AI type definitions
│   ├── requestBuilder.ts      # AI request construction
│   └── temporal.ts            # Temporal date utilities
└── config/                    # ui.config, theme.config, audio.config, typography.config, shortcuts.config, app.config

services/                      # Business logic layer
├── unifiedAIService.ts        # AI routing: audio processing, title generation, Whisper
├── transcription.service.ts   # Post-LLM pipeline (save transcript, summary, todos, index, extract entities)
├── ai/                        # Vercel AI SDK layer (provider factory, message converter, tools bridge, suggestions)
│   ├── provider.ts            # createModel() — maps ResolvedModel → AI SDK LanguageModel
│   ├── message-converter.ts   # ChatMessage[] → AI SDK ModelMessage[]
│   ├── tools-bridge.ts        # Tool adapters
│   └── types.ts               # TokenUsage, StreamMetadata, ProviderType
├── adapters/                  # Legacy provider adapters (types.ts, tool-converter.ts)
├── platform-fetch.ts          # Tauri HTTP transport (CORS bypass via Rust reqwest)
├── modalities.ts              # Model capabilities from models.dev (cached on disk, 24h TTL)
├── repositories/              # Per-meeting file storage (13 repositories)
│   ├── base.repository.ts     # BaseRepository (readJson, writeJson, deleteFile)
│   ├── meeting-index.repository.ts
│   ├── transcript.repository.ts
│   ├── summary.repository.ts
│   ├── todos.repository.ts
│   ├── notes.repository.ts
│   ├── recording-meta.repository.ts
│   ├── chat-session.repository.ts
│   ├── chat-index.repository.ts
│   └── reminder.repository.ts
├── storage/                   # Tauri filesystem (settings, cache, paths)
├── tauri/                     # Tauri native API wrappers (environment, notification, dialog, filesystem, tray)
├── providers/                 # Provider config (Tauri/Web/Default implementations)
└── migration/                 # Data migrations (localStorage → filesystem)

extensions/
├── rag/                       # RAG system (17 files)
│   ├── client.ts              # vectorDB invoke wrapper
│   ├── graph-client.ts        # Knowledge graph invoke wrapper
│   ├── chunker.ts             # Sentence-boundary splitting with overlap
│   ├── embeddings.ts          # Transformers.js Web Worker (all-MiniLM-L6-v2, 384-dim)
│   ├── indexer.ts             # Meeting indexing (staleness via SHA-256 content hash)
│   ├── chat-indexer.ts        # Chat session indexing
│   ├── searcher.ts            # Hybrid search (KNN + FTS5 + RRF)
│   ├── chat-searcher.ts       # Chat search
│   ├── entity-extractor.ts    # LLM entity extraction → knowledge graph
│   ├── consent.ts             # Model download consent bridge
│   ├── progress.ts            # Progress event bridge
│   ├── types.ts               # RAGStatus, SearchOptions, EmbeddingService
│   ├── graph-types.ts         # Entity/relationship types
│   └── constants.ts           # Named constants (concurrency limits, chunk sizes)
├── tools/                     # LLM tool calling system (9 tools)
│   ├── registry.ts            # ToolRegistry singleton
│   ├── executor.ts            # ToolExecutor (never throws, returns ToolResult)
│   ├── types.ts               # ToolDefinition, ToolCall, ToolResult, ToolSchema
│   ├── constants.ts           # LLM context limits, truncation
│   ├── context-budget.ts      # LLMContextBudget tracker
│   └── definitions/
│       ├── search-meetings.tool.ts
│       ├── search-chats.tool.ts
│       ├── get-meeting.tool.ts
│       ├── get-chat.tool.ts
│       ├── list-meetings.tool.ts
│       ├── list-chats.tool.ts
│       ├── get-action-items.tool.ts
│       ├── manage-todo.tool.ts
│       └── query-graph.tool.ts
├── tool-orchestrator/         # 3-step orchestration: Intent → Retrieval → Synthesis
│   ├── index.ts               # orchestrate() entry point
│   ├── intent-classifier.ts   # LLM intent classification (11 intent types)
│   ├── retrieval-executor.ts  # Programmatic tool execution (no LLM)
│   ├── message-buffer.ts      # Ephemeral conversation buffer
│   └── types.ts               # OrchestratorOptions, IntentType, ToolActivity
└── context-pipeline/          # @mention context resolution

src-tauri/                     # Rust backend
├── src/
│   ├── lib.rs                 # App init, plugin registration, command handlers
│   ├── audio_core.rs          # ScreenCaptureKit + CPAL audio capture (48kHz→16kHz resampling)
│   ├── window.rs              # Window management (show/hide/toggle, always-on-top, close-to-tray)
│   ├── shortcuts.rs           # Global keyboard shortcuts
│   ├── autostart.rs           # Login item management
│   ├── wake_lock.rs           # IOKit sleep prevention during recording
│   ├── screenshot.rs          # Window enumeration + screenshot capture (CGWindowList)
│   └── main.rs                # Entry point
└── plugins/
    ├── tauri-plugin-vectordb/  # sqlite-vec + FTS5 + Knowledge Graph (35 commands, schema v5)
    ├── tauri-plugin-llamacpp/  # llama.cpp server management (8 commands)
    └── tauri-plugin-calendar/  # macOS EventKit calendar access (4 commands)
```

---

## Key Patterns

### Tool Orchestration (3-Step Architecture)
```
User Message → Intent Classification (LLM) → Programmatic Retrieval (DB) → Streaming Synthesis (LLM)
```
- Intent types: general, meeting_search, meeting_recall, meeting_detail, meeting_list, action_items, manage_todos, relationship, cross_meeting, chat_recall, catch_up
- Retrieval is programmatic (no LLM) — runs tools directly based on classified intent
- Synthesis streams with optional web search (provider-specific: OpenAI/xAI use Responses API, Gemini/Anthropic use native tools)

### AI Provider Architecture (Vercel AI SDK)
- `services/ai/provider.ts` creates AI SDK `LanguageModel` instances
- Providers: OpenAI, Anthropic, Gemini, Mistral, xAI, Groq, OpenAI-compatible (OpenRouter, Azure, Cohere, HuggingFace, Local Server)
- Local: llama.cpp via Tauri plugin, Local Server (Ollama/LM Studio/Jan) via OpenAI-compatible adapter
- HTTP goes through `@tauri-apps/plugin-http` (Rust reqwest) to bypass CORS — never override `globalThis.fetch`
- SDK `fetch:` parameter injection for transport

### Event Bridge Pattern (non-React ↔ React)
- `extensions/rag/progress.ts` — embedding/indexing progress events
- `extensions/rag/consent.ts` — model download consent
- Single listener pattern, returns unsubscribe function

### Theme System
- `src/config/theme.config.ts` — `SURFACE`, `BORDER`, `TEXT`, `COMPONENT`, `RADIUS`, `SHADOW` token objects
- `src/config/ui.config.ts` — spacing, sizing, z-index, typography constants
- Always use tokens, never inline Tailwind colors

### Context Provider Hierarchy (AppProviders.tsx)
```
ErrorBoundary → ThemeProvider → ToastProvider → SettingsProvider → UnsavedChangesProvider →
  AppProvider → HistoryProvider → MeetingProvider → MeetingDataProviders (Notes + Todos) →
  ImportProvider → ChatProvider → RecordingProviderWrapper
```

### Data Layer
- Per-meeting file storage: `meetings/{id}/transcript.json`, `summary.json`, `todos.json`, `notes.json`, `recording-meta.json`
- Chat storage: `chats/{sessionId}.json` with `chats/index.json`
- Repository pattern: `services/repositories/` — BaseRepository with `readJson<T>()`, `writeJson<T>()`
- IndexedRepository for index.json management with concurrency-safe initialization
- `transcriptionService.saveTranscriptionResult()` — atomic save with cleanup on partial failure, fire-and-forget RAG indexing + entity extraction

### Streaming Architecture (Chat)
- `streamingStore` (Zustand) — RAF-batched content updates for smooth streaming
- Multimodal parts: text, image, audio, video, document, tool_call
- `onChunk(text, metadata)` carries stream state (isThinking, isSearching, webCitations)
- Tool activity tracking via `onToolActivity()` callbacks

### Recording Sessions
- Multi-session via `useRecordingSessions()` — only 1 active capture, unlimited review/processing
- Session lifecycle: recording → paused → review → processing → removed
- Audio: ScreenCaptureKit for system audio (48kHz), CPAL for microphone, rubato FFT resampling to 16kHz

### RAG Pipeline
- Embedding: Transformers.js Web Worker (all-MiniLM-L6-v2, 384-dim, local/offline)
- Indexing: 3-phase staleness (content_hash, embedding_hash, extraction_hash)
- Search: Hybrid KNN + FTS5 + Reciprocal Rank Fusion (k=60) in Rust
- Knowledge Graph: Entity extraction → kg_nodes/kg_edges in SQLite
- Gated behind user consent for model download

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
- Use type-only imports: `import type { HistoryItem } from '@/types'`

### DON'T
- Add files to legacy folders (`/components/`, `/hooks/`, `/utils/`, `/consts/`)
- Override `globalThis.fetch` in Tauri WebView — breaks Vite HMR
- Use `any` type without strong justification
- Use relative imports (`../../../`) — use path aliases
- Hardcode dimensions, colors, or thresholds inline
- Skip error handling in async functions
- Create new global state without updating `AppProviders.tsx`
- Add fallback code, legacy compatibility, or migration paths (pre-release, no users)

---

## Storage Layout

All data stored in Tauri app data directory (`~/Library/Application Support/ai.kasset.desktop/`):
```
meetings/
├── index.json                    # Lightweight meeting index for sidebar
└── {id}/
    ├── transcript.json
    ├── summary.json
    ├── todos.json
    ├── notes.json
    └── recording-meta.json
chats/
├── index.json                    # Chat session index
└── {sessionId}.json
recordings/                       # Audio files (WAV)
cache/
├── api/                          # API response cache (24h TTL)
└── audio/                        # Temp audio files
vectordb.sqlite                   # sqlite-vec + FTS5 + knowledge graph
settings.json                     # User settings (API keys encrypted AES-256-GCM)
```

---

## Native ↔ Web Alignment (Tauri + macOS)

**Problem:** Native OS elements (macOS traffic lights, system toolbars) exist outside the DOM. Their positions are set by Tauri config (`trafficLightPosition`) or the OS, not CSS.

**Rule: Never calculate native element positions from config. Always measure empirically.**

Inject colored lines at known y-values in DevTools, visually compare against native elements. See AGENTS.md for the measurement technique.

**Current values (empirically measured):**
- macOS traffic light center: **y=30px** (with `trafficLightPosition: { x: 20, y: 32 }`)

---

## Debugging

- **Console logs**: Use format `[ComponentName] Message:`, value
- **DevTools**: Available in `npm run tauri:dev` mode
- **Rust logs**: Check terminal running `npm run tauri:dev`
- **Test debugging**: Add `.only` to focus single test: `it.only('test', ...)`
