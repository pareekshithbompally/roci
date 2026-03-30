# Kasset AI - Developer & AI Agent Context

This `GEMINI.md` file provides essential context for AI agents and developers working on the **Kasset AI** project.

## Project Overview

**Kasset AI** is a macOS meeting intelligence application. It is designed to be private and local-first, featuring real-time audio capture, meeting transcription, and a built-in general-purpose AI chat with tool calling and web search. It supports multiple AI providers via the Vercel AI SDK and uses local vector search (sqlite-vec) with a knowledge graph for Meeting RAG. All data, including recordings and transcripts, stays on the user's machine.

**Tech Stack:**
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Zustand, Radix UI
- **AI:** Vercel AI SDK (@ai-sdk/*) for multi-provider routing
- **Backend:** Tauri 2.x, Rust (1.77+)
- **OS:** macOS 15.0+ (Apple Silicon M1+)
- **Audio:** ScreenCaptureKit (native macOS API for system + mic audio)
- **Database:** `tauri-plugin-vectordb` (sqlite-vec + FTS5 + Knowledge Graph)
- **Local AI:** `tauri-plugin-llamacpp` (llama.cpp server management)
- **Calendar:** `tauri-plugin-calendar` (macOS EventKit)

## Project Architecture

The project is structured into a frontend React application and a backend Tauri Rust application.

```
kasset-ai/
├── src/                # Modern React frontend (USE THIS)
│   ├── app/            # App bootstrap (App.tsx, AppProviders.tsx)
│   ├── features/       # Feature modules (12: calendar, chat, history, home, import, layout, notes, recording, settings, summary, todos, transcription)
│   ├── shared/         # Cross-feature contexts (8), hooks (10), components, UI primitives (Radix), utils
│   ├── core/ai/        # AI prompts, Zod schemas, request builder, types
│   └── config/         # App configuration (ui, theme, audio, typography, shortcuts, app)
├── services/           # Business logic layer
│   ├── ai/             # Vercel AI SDK layer (provider factory, message converter, tools bridge)
│   ├── unifiedAIService.ts  # AI routing (audio processing, Whisper, title generation)
│   ├── transcription.service.ts  # Post-LLM pipeline (save, index, extract entities)
│   ├── modalities.ts   # Model capabilities (models.dev API, cached 24h)
│   ├── platform-fetch.ts  # Tauri HTTP transport (CORS bypass)
│   ├── repositories/   # Per-meeting file storage (13 repositories, BaseRepository pattern)
│   ├── storage/        # Tauri filesystem (settings encrypted AES-256-GCM, cache, paths)
│   ├── tauri/          # Tauri native API wrappers
│   └── providers/      # Provider config (Tauri/Web/Default implementations)
├── extensions/         # Advanced features
│   ├── rag/            # RAG: embeddings (Transformers.js), indexing, hybrid search, KG, entity extraction
│   ├── tools/          # 9 LLM tools (search, get, list meetings/chats, manage todos, query graph)
│   ├── tool-orchestrator/  # 3-step: Intent → Retrieval → Synthesis
│   └── context-pipeline/   # @mention context resolution
├── tests/              # Vitest + React Testing Library tests
├── src-tauri/          # Rust backend
│   ├── src/            # Core (audio_core, window, shortcuts, autostart, wake_lock, screenshot)
│   └── plugins/        # Custom Tauri plugins (vectordb: 35 cmds, llamacpp: 8 cmds, calendar: 4 cmds)
└── scripts/            # Build helpers (Swift runtime bundling)
```

**Note on Legacy Folders:** Folders like `/components/`, `/hooks/`, `/utils/`, and `/consts/` in the root are considered legacy. New development should occur within `src/features/` or `src/shared/`.

## Building and Running

**Prerequisites:** Node.js 20+, Rust 1.77+, Xcode Command Line Tools (`xcode-select --install`).

* **Development Server (Frontend + Backend):** `npm run tauri:dev` (Recommended for full app testing)
* **Development Server (Frontend Only):** `npm run dev`
* **Production Build:** `npm run tauri:build` (Outputs `.dmg`)
* **Testing:**
  * Run all tests: `npm test`
  * Watch mode: `npm run test:watch`
  * Coverage: `npm run test:coverage`

## Development Conventions

### TypeScript & Code Style
- **Strict TypeScript:** Avoid `any` (use `unknown` if necessary). Use `interface` for public APIs and `type` for unions/intersections. Always use type-only imports (`import type { ... }`).
- **Path Aliases:** NEVER use relative paths like `../../../`. Use configured aliases: `@/*`, `@app/*`, `@features/*`, `@shared/*`, `@config/*`, `@core/*`, `@extensions/*`, `@assets/*`, `@platform/*`.
- **Styling:** Use Tailwind CSS exclusively. No CSS modules or inline styles. Use predefined constants from `UI_CONFIG` and theme tokens (`SURFACE`, `BORDER`, `TEXT`, `COMPONENT`).
- **Feature Modules:** When working within `src/features/`, always import from the feature's `index.ts` file, not from internal feature files.
- **Naming:**
  - Components: PascalCase (`SettingsPanel`)
  - Hooks: camelCase with `use` prefix (`useApp`)
  - Services: camelCase with `Service` suffix (`unifiedAIService`)
  - Config constants: UPPER_SNAKE_CASE (`UI_CONFIG`)
  - Types/Interfaces: PascalCase (`AppSettings`)

### Cross-Origin Resource Sharing (CORS)
- Browser `fetch()` often causes CORS failures with AI providers.
- **CRITICAL:** Do NOT override `globalThis.fetch`.
- HTTP requests to AI providers are routed through Tauri's Rust-based `plugin-http` (using `reqwest`) to bypass browser CORS restrictions. This is handled in `services/platform-fetch.ts` and the AI SDK provider factory.

### State Management
- **React Contexts** (in `src/shared/contexts/`): AppContext, ChatContext, HistoryContext (split: HistoryDataContext + HistoryUIContext), MeetingContext, SettingsContext, ThemeContext, ToastContext, UnsavedChangesContext
- **Zustand stores**: streamingStore (RAF-batched streaming), todoProposalStore, activityStore
- Key hooks: `useApp()`, `useSettings()`, `useHistory()`, `useHistoryData()`, `useChat()`, `useMeeting()`, `useToast()`, `useTheme()`

### Testing Practices
- **Framework:** Vitest + React Testing Library (with `jsdom`).
- Tests in `tests/unit/` and `tests/integration/`
- Setup in `tests/setup.ts`

### Key Architectural Patterns
- **Tool Orchestration**: 3-step (Intent Classification → Programmatic Retrieval → Streaming Synthesis). 11 intent types, 9 tools.
- **RAG**: Embeddings (Transformers.js, all-MiniLM-L6-v2) → Chunking → sqlite-vec KNN + FTS5 → Reciprocal Rank Fusion. 3-phase staleness (content/embedding/extraction hash).
- **Repository Pattern**: BaseRepository → readJson/writeJson. IndexedRepository for index.json management.
- **Event Bridge**: Non-React code emits events, React subscribes (progress, consent).
- **Transactional Saves**: Promise.allSettled with cleanup on partial failure.

For full, detailed guidelines, always refer to the `AGENTS.md` file located in the root directory.
