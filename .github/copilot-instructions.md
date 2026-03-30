# Kasset AI - Copilot Instructions

> macOS meeting intelligence app — private, local-first, Tauri 2.x + React 19 + TypeScript + Vite

## Commands

```bash
npm run tauri:dev      # Full Tauri app (REQUIRED for Rust backend integration)
npm run dev            # Vite only (frontend debugging, no Tauri APIs)
npm run tauri:build    # Production build (.dmg)

npm test                                          # All tests (Vitest)
npm run test:watch                                # Watch mode
npm run test:coverage                             # Coverage report
npx vitest tests/unit/utils.test.ts               # Single test file
npx vitest tests/unit/utils.test.ts -t "name"     # Specific test by name
```

## Architecture

Three-layer structure: **React frontend** (`src/`) → **services** (`services/`) → **Rust backend** (`src-tauri/`). A fourth layer, **extensions** (`extensions/`), holds the AI tooling and RAG system.

```
src/
├── app/              # App.tsx, AppProviders.tsx
├── features/         # Feature modules (chat, recording, history, notes, todos,
│                     #   settings, summary, transcription, calendar, home,
│                     #   layout, import, context-pipeline, rag, tools)
├── shared/           # Cross-feature contexts, hooks, utils, UI primitives
├── core/             # AI prompts, schemas, types (src/core/ai/)
├── platform/         # Platform detection (isTauriEnvironment, SUPPORTS_VIBRANCY)
└── config/           # ui.config.ts, theme.config.ts, audio.config.ts, etc.

services/             # Business logic (AI routing, adapters, storage, Tauri wrappers)
extensions/           # AI tooling layer
├── tools/            # Tool registry, executor, tool definitions
├── tool-orchestrator/ # 3-step orchestration: intent → retrieval → synthesis
├── rag/              # Vector search, chunking, embeddings, indexer
├── context-pipeline/ # @mention context resolution
├── llamacpp/         # Local LLM bridge
└── usage/            # Token usage tracking

src-tauri/
├── src/              # audio_core.rs, window.rs, shortcuts.rs, autostart.rs
└── plugins/
    ├── tauri-plugin-vectordb/  # sqlite-vec RAG + knowledge graph
    └── tauri-plugin-llamacpp/  # llama.cpp local inference
```

## Context Provider Hierarchy

Defined in `src/app/AppProviders.tsx`. Order matters — outer providers are available to inner ones:

```
ErrorBoundary → ThemeProvider → ToastProvider → SettingsProvider →
UnsavedChangesProvider → AppProvider → HistoryProvider → MeetingProvider →
[NotesProvider + TodosProvider] → ImportProvider → ChatProvider → RecordingProvider
```

`RecordingProvider` is wrapped to inject `useSettings()`, `useHistory()`, `useApp()` dependencies.

## Path Aliases (CRITICAL — never use relative `../` imports)

```typescript
@/*           → project root
@app/*        → src/app/*
@features/*   → src/features/*
@shared/*     → src/shared/*
@config/*     → src/config/*
@assets/*     → src/assets/*
@core/*       → src/core/*
@platform/*   → src/platform/*
@extensions/* → extensions/*
```

Always import from a feature's `index.ts`, never from internal files:
```typescript
// ✓ correct
import { ChatPanel } from '@features/chat';
import { SURFACE, COMPONENT } from '@config/theme.config';
import { toolRegistry } from '@extensions/tools';

// ✗ wrong
import { ChatPanel } from '@features/chat/components/ChatPanel';
import { useApp } from '../../../shared/contexts/AppContext';
```

## TypeScript Conventions

- `interface` for public APIs, `type` for unions/intersections
- `unknown` not `any`; always type-guard before use
- `import type { ... }` for type-only imports
- Log format: `console.error('[ComponentName] Operation failed:', error)`

```typescript
catch (error: unknown) {
  console.error('[ComponentName] Failed:', error);
  toast.error(error instanceof Error ? error.message : 'Operation failed');
}
```

## Styling

**Tailwind CSS only** — no CSS modules, no inline styles.

This project uses a **custom color palette** — do NOT use generic Tailwind colors like `zinc-*`:
- Light mode: `parchment-50` through `parchment-400`
- Dark mode: `night-750` through `night-950`
- Always pair with `dark:` variants

**Use design tokens** from `src/config/theme.config.ts` instead of inlining class strings:

| Token Object | Purpose |
|---|---|
| `SURFACE` | Background colors (`page`, `sidebar`, `modal`, `elevated`, `input`, `card`, etc.) |
| `BORDER` | Border colors (`default`, `subtle`, `input`, `inputFocus`, `glass`, etc.) |
| `TEXT` | Text colors (`primary`, `secondary`, `muted`, `error`, `success`, `link`, etc.) |
| `COMPONENT` | Self-contained component styles (includes layout + padding + radius + color) |
| `LAYOUT` | Sidebar/page structural classes |
| `RADIUS`, `SHADOW`, `SPACING` | Scale tokens |

Settings buttons must use `COMPONENT` tokens: `settingsButtonPrimary`, `settingsButtonDanger`, `settingsButtonOutline`, `settingsLink`, etc.

`UI_CONFIG` in `src/config/ui.config.ts` holds numeric constants (sidebar widths, z-index scale, icon sizes, debounce delays, etc.).

## Key Context Hooks

```typescript
const { status, setStatus, currentView } = useApp();
const { settings, updateSettings } = useSettings();
const { startRecording, stopRecording } = useRecordingContext();  // from @features/recording
const { items, addToHistory, deleteItem } = useHistoryData();    // data only — prefer over useHistory()
const { success, error, warning } = useToast();
const { meeting } = useMeeting();
```

**HistoryContext is split**: use `useHistoryData()` for data-only consumers (chat, idle, results). Use `useHistory()` only when you also need sidebar menu/rename/delete UI state.

## AI & Tooling Architecture

### Multi-Provider Routing (`services/unifiedAIService.ts`)
Routes by provider type:
- **Gemini**: native `@google/genai` SDK, handles audio as `FilePart`
- **OpenAI**: native `openai` SDK
- **Anthropic**: native `@anthropic-ai/sdk`
- **OpenAI-compatible**: single adapter for Mistral, Groq, OpenRouter, Cohere, Azure, HuggingFace, xAI
- **Local**: llama.cpp (Tauri plugin) or Local Server (Ollama/LM Studio/Jan)

### CORS Transport
**Never override `globalThis.fetch`** — it breaks Vite HMR and WebView internals.

All SDK HTTP goes through Tauri's Rust `reqwest` to bypass browser CORS:
```typescript
import { getPlatformFetch } from '@/services/platform-fetch';
// Pass to SDK constructors: new OpenAI({ fetch: getPlatformFetch() })
```

### 3-Step Tool Orchestration (`extensions/tool-orchestrator/`)
The `orchestrate()` function runs:
1. **Intent classification** — LLM classifies the query intent and retrieval depth
2. **Programmatic retrieval** — direct DB/tool calls with no LLM, returns context + citations
3. **Synthesis** — streaming LLM response with injected retrieval context (in messages, not system prompt)

### Tool System (`extensions/tools/`)
- `registry.ts` — `ToolRegistry` singleton; `.register()`, `.getSchemas()`, `.getTool()`
- `executor.ts` — `ToolExecutor`; never throws, always returns `ToolResult`
- `definitions/` — individual tool files (`search-meetings`, `get-meeting`, `list-meetings`, etc.)

## Tauri Integration

Rust commands (grep `#[tauri::command]` in `src-tauri/src/`):
- **Audio**: `start_recording`, `stop_recording`, `get_audio_sources`
- **Window**: `set_always_on_top`, `minimize_window`
- **Shortcuts**: `register_shortcut`, `unregister_shortcut`
- **Autostart**: `is_autostart_enabled`, `enable_autostart`

Always call via service wrappers in `services/tauri/`:
```typescript
import { windowService } from '@/services/tauri';
await windowService.setAlwaysOnTop(true);
```

Wrap Tauri-specific code in `isTauriEnvironment()` checks (from `@platform/index`).

**Tauri `readDir` quirk**: `DirEntry` only has `name`, `isDirectory`, `isFile`, `isSymlink` — no `path` field. Construct full path manually: `join(dir, entry.name)`.

## Storage

All data in `~/Library/Application Support/ai.kasset.desktop/`:
- `recordings/` — audio files
- `transcriptions/{id}.json`, `summaries/{id}.json`, `chats/{id}.json`
- `history.json` — meeting index
- `settings.json` — API keys encrypted (AES-256-GCM)
- `vectordb.sqlite` — RAG via sqlite-vec

Use `services/repositories/` (one repo per document type) and `services/storage/` for file system access.

## Shared Utilities

- `src/shared/utils/todo.utils.ts` — all todo date/time logic (`isOverdue`, `formatDueDate`, `normalizeDueDate`, `buildISOFromDateInput`). Do not define these elsewhere.
- `src/shared/utils/async.utils.ts` — `concurrencyMap()` for large collections (prefer over `Promise.all(items.map(...))`)
- `src/shared/utils/text.utils.ts` — `truncateForLLM()` for content-aware LLM truncation
- `extensions/tools/constants.ts` — `LLMContextBudget`, all LLM context size limits

## Don'ts

- **No new code in legacy folders**: `/components/`, `/hooks/`, `/utils/`, `/consts/` — use `src/features/*/` or `src/shared/` instead
- **No migration paths or backward compatibility layers** — pre-release, zero existing users
- **No hardcoded colors** — use `parchment-*`/`night-*` palette with theme tokens
- **No `globalThis.fetch` override**
- **No relative imports** (`../../../`) — always use path aliases
- **npm only** — never pnpm
