# Roci AI - AI Agent Instructions

> **macOS meeting intelligence app — private, local-first, with built-in general-purpose AI chat**
> Tauri 2.x + React 19 + TypeScript + Vite | Multi-provider AI (Vercel AI SDK) | ScreenCaptureKit audio | sqlite-vec RAG + Knowledge Graph


## Architecture Overview

This is a **Tauri-based desktop app** with a clear separation between frontend (React/TypeScript) and backend (Rust). The frontend uses a **feature-based modular architecture** where each domain (chat, recording, history, etc.) is self-contained in `src/features/`.

### Critical Architecture Concepts

**Dual-layer separation:**
- Frontend: React components + business logic in `src/` and `/services/`
- Backend: Rust Tauri commands in `src-tauri/src/` for system-level operations (audio capture via ScreenCaptureKit, vector DB, local LLM, window management, calendar access, screenshots, wake lock)

**Feature modules** (`src/features/*`) are the primary location for new code:
```
features/
├── calendar/         # Week view calendar (Schedule-X), event popovers
├── chat/             # AI chat: streaming, multimodal, tool calls, citations, speech input
├── history/          # Meeting history sidebar, search, rename, delete
├── home/             # Home view router (idle → chat → results)
├── import/           # Audio/transcript file import with concurrent job queue
├── layout/           # MainLayout with resizable sidebar + right chat panel
├── notes/            # Per-meeting notes CRUD
├── recording/        # Audio capture controls, multi-session, timer, source selection
├── settings/         # 7-panel settings (Audio, Providers, Local Inference, Categories, Integrations, Usage, Interface)
├── summary/          # Summary display
├── todos/            # Todo management with priorities, due dates, reminders, AI proposals
├── transcription/    # Transcript views
└── [feature]/
    ├── components/   # Feature components
    ├── hooks/        # Feature hooks
    ├── context/      # Feature context (optional)
    ├── types/        # Feature types (optional)
    ├── stores/       # Zustand stores (optional)
    ├── services/     # Feature services (optional)
    └── index.ts      # Always export through here
```

**Context Provider Hierarchy** (defined in AppProviders.tsx):
```
ErrorBoundary → ThemeProvider → ToastProvider → TooltipProvider → QueryClientProvider →
  SettingsProvider → HistoryProvider → ImportProvider
```
Order matters: outer providers are available to inner providers.

**Services Layer** (`/services/`) handles business logic:
- `unifiedAIService.ts` - AI routing: audio processing, Whisper transcription, title generation
- `ai/` - Vercel AI SDK layer (provider factory, message converter, tools bridge, token usage)
- `adapters/` - Legacy provider-specific adapters and tool converter
- `platform-fetch.ts` - Tauri HTTP transport (bypasses CORS via Rust reqwest)
- `modalities.ts` - Model capabilities from models.dev API (cached on disk, 24h TTL)
- `transcription.service.ts` - Post-LLM pipeline (save transcript, summary, todos, index, extract entities)
- `repositories/` - Per-meeting file storage (13 repositories with BaseRepository pattern)
- `storage/` - Tauri filesystem operations (settings encrypted AES-256-GCM, cache, paths)
- `tauri/` - Wrapper services for Tauri native APIs (environment, notification, dialog, filesystem, tray)
- `providers/` - Provider configuration (Tauri/Web/Default implementations)
- `migration/` - Data migration between versions (localStorage → filesystem)

**Extensions Layer** (`/extensions/`) handles advanced features:
- `rag/` - RAG system: embeddings (Transformers.js), indexing, hybrid search, knowledge graph, entity extraction
- `tools/` - LLM tool calling system: 9 tool definitions, registry, executor, context budget
- `tool-orchestrator/` - 3-step orchestration: Intent Classification → Programmatic Retrieval → Streaming Synthesis
- `context-pipeline/` - @mention context resolution for chat

**Rust Backend** (`src-tauri/`):
- `src/audio_core.rs` - Real-time audio capture via ScreenCaptureKit (system audio + microphone), 48kHz→16kHz resampling
- `src/window.rs` - Window management (show/hide/toggle, always-on-top, close-to-tray)
- `src/shortcuts.rs` - Global keyboard shortcuts with frontend event emission
- `src/autostart.rs` - Login item management
- `src/wake_lock.rs` - IOKit sleep prevention during recording
- `src/screenshot.rs` - Window enumeration (CGWindowList) + screenshot capture
- `plugins/tauri-plugin-vectordb/` - sqlite-vec vector DB + FTS5 + Knowledge Graph (35 commands, schema v5)
- `plugins/tauri-plugin-calendar/` - macOS EventKit calendar access (4 commands)

## Development Workflow

### Essential Commands
```bash
npm run tauri:dev      # Full Tauri app (RECOMMENDED for dev)
npm run dev            # Vite only (frontend debugging)
npm run tauri:build    # Production build (.dmg)

npm test               # Run all tests (Vitest + RTL)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npx vitest tests/unit/utils.test.ts  # Single test file
```

**Always use `npm run tauri:dev`** for development to test Rust backend integration. Frontend-only `npm run dev` won't have access to Tauri APIs.

### Testing Setup
- Framework: **Vitest** + **React Testing Library**
- Environment: jsdom
- Config: vitest.config.ts
- Setup: tests/setup.ts
- Structure: tests/unit/, tests/integration/

## Code Conventions

### Import Patterns (CRITICAL)
**Always use path aliases** defined in tsconfig.json and vite.config.ts:

```typescript
// CORRECT
import { useApp } from '@shared/contexts/AppContext';
import { RecordingProvider, useRecording } from '@features/recording';
import { UI_CONFIG } from '@config/ui.config';
import { unifiedAIService } from '@/services/unifiedAIService';
import { toolRegistry } from '@extensions/tools';
import { orchestrate } from '@extensions/tool-orchestrator';

// NEVER
import { useApp } from '../../../shared/contexts/AppContext';
import { RecordButton } from '@features/recording/components/RecordButton'; // Import from index.ts!
```

**Path alias mapping:**
```
@/*           → project root
@app/*        → src/app/*
@features/*   → src/features/*
@shared/*     → src/shared/*
@config/*     → src/config/*
@core/*       → src/core/*
@assets/*     → src/assets/*
@platform/*   → src/platform/*
@extensions/* → extensions/*
```

### Legacy Folders (DO NOT MODIFY)
These folders exist for backward compatibility but **should NOT receive new code**:
- `/components/` → Use `src/features/*/components/` instead
- `/hooks/` → Use `src/shared/hooks/` or feature hooks
- `/utils/` → Use `src/shared/utils/`
- `/consts/` → Use `src/config/`

### TypeScript Conventions
```typescript
// Prefer interface for public APIs
interface RecordingState {
  status: RecordingStatus;
  duration: number;
}

// Use type for unions/intersections
type ViewType = 'home' | 'settings';

// Avoid 'any', use 'unknown' when type is uncertain
catch (error: unknown) {
  console.error('[Component] Error:', error);
}

// Type-only imports
import type { HistoryItem } from '@/types';
```

### Styling (Tailwind Only)
- **No CSS modules, no inline styles**
- Contract: `src/styles/tokens.css` → `tailwind.config.js` / `src/config` → `@shared/ui` kit → features (see CLAUDE.md I3)
- Features use kit props + layout utilities only — no colour/size/radius/border/shadow/`dark:` classes
- `npm run audit:design` must stay at 0 (LandingGlow is the one exception)

```jsx
<Surface variant="card" radius="lg"><Text variant="body" tone="muted">…</Text></Surface>
```

### State Management
- **React Context**: Global state (App, Settings, History, Chat, Meeting, Theme, Toast, UnsavedChanges)
- **Zustand**: Feature-local stores (streamingStore for RAF-batched streaming, todoProposalStore, activityStore)
- **useRef**: Prevent re-renders in performance-critical hooks

### Error Handling
```typescript
try {
  await performAction();
} catch (error: unknown) {
  console.error('[ComponentName] Action failed:', error);
  toast.error(error instanceof Error ? error.message : 'Operation failed');
}
```

## Key Integration Points

### Multi-Provider AI Architecture (Vercel AI SDK)
`services/ai/provider.ts` creates AI SDK `LanguageModel` instances via `createModel()`:
- **Native providers**: OpenAI, Anthropic, Gemini, Mistral, xAI, Groq
- **OpenAI-compatible**: OpenRouter, Azure, Cohere, HuggingFace, Local Server (Ollama/LM Studio/Jan)

Web search support:
- OpenAI/xAI: `.responses()` API (Responses API)
- Gemini/Anthropic: Native tools in chat API

HTTP transport uses `@tauri-apps/plugin-http` (Rust reqwest) to bypass CORS — never override `globalThis.fetch`.

Provider configuration stored encrypted at rest (AES-256-GCM).

### Tool Orchestration (3-Step Architecture)
```
Step 1: Intent Classification (LLM) → IntentType + search_query + depth
Step 2: Programmatic Retrieval (DB access, no LLM) → context string + citations
Step 3: Streaming Synthesis (LLM with web search) → streamed response
```

Intent types: general, meeting_search, meeting_recall, meeting_detail, meeting_list, action_items, manage_todos, relationship, cross_meeting, chat_recall, catch_up

9 tools: search_meetings, search_chats, get_meeting, get_chat, list_meetings, list_chats, get_action_items, manage_todo, query_graph

### RAG System
- **Embeddings**: Transformers.js Web Worker (all-MiniLM-L6-v2, 384-dim, local/offline)
- **Indexing**: 3-phase staleness tracking (content_hash, embedding_hash, extraction_hash via SHA-256)
- **Search**: Hybrid KNN (sqlite-vec) + FTS5 + Reciprocal Rank Fusion (k=60)
- **Knowledge Graph**: Entity extraction → kg_nodes/kg_edges in SQLite, traversal queries
- **Consent**: Gated behind user consent before first embedding model download

### Storage Architecture
All data stored in Tauri app data directory (`~/Library/Application Support/ai.roci.roci/`):
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
recordings/                       # Audio files (WAV, 16kHz mono)
cache/
├── api/                          # API response cache (24h TTL)
└── audio/                        # Temp audio files
vectordb.sqlite                   # sqlite-vec + FTS5 + knowledge graph
settings.json                     # User settings (API keys encrypted AES-256-GCM)
```

### Tauri Backend Commands
Rust commands exposed to frontend (60+ total):

**Audio** (audio_core.rs): `start_audio_capture`, `stop_audio_capture`, `pause_audio_capture`, `resume_audio_capture`
**Window** (window.rs): `get_window_state`, `save_window_state`, `show_window`, `hide_window`, `toggle_window`, `set_always_on_top`
**Shortcuts** (shortcuts.rs): `register_shortcut`, `unregister_shortcut`, `unregister_all_shortcuts`, `is_shortcut_registered`
**Autostart** (autostart.rs): `enable_autostart`, `disable_autostart`, `is_autostart_enabled`
**Wake Lock** (wake_lock.rs): `acquire_wake_lock`, `release_wake_lock`
**Screenshot** (screenshot.rs): `list_capturable_windows`, `take_screenshot`
**VectorDB plugin** (35 commands): search, upsert, delete, staleness detection, knowledge graph CRUD, usage analytics
**Calendar plugin** (4 commands): request_access, check_access, get_upcoming_events, get_events_in_range

### Context Access Patterns
```typescript
const { status, setStatus, currentView } = useApp();
const { settings, updateSettings } = useSettings();
const { startRecording, stopRecording, isRecording } = useRecordingContext();
const { items, addToHistory, deleteItem } = useHistory();
const { success, error, warning } = useToast();
```

### Adding a New Feature
1. Create folder in `src/features/feature-name/`
2. Structure: `components/`, `hooks/`, `context/`, `types/`, `stores/`, `services/`, `index.ts`
3. Export public API through `index.ts`
4. Add provider to AppProviders.tsx if needed
5. Import via `@features/feature-name`

### Adding a New Tool
1. Create `extensions/tools/definitions/my-tool.tool.ts` implementing `ToolDefinition`
2. Register in `extensions/tools/index.ts` via `toolRegistry.register()`
3. Add intent routing in `extensions/tool-orchestrator/retrieval-executor.ts`
4. Update system prompt in `src/core/ai/prompts/chat.prompt.ts`

## Debugging
- **Console logs**: Use format `[ComponentName] Message:`, value
- **DevTools**: Available in `npm run tauri:dev` mode
- **Rust logs**: Check terminal running `npm run tauri:dev`
- **Package manager**: npm only (never pnpm)
