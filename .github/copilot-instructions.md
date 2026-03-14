# Kasset AI - AI Agent Instructions

> **macOS meeting intelligence app — private, local-first, with built-in general-purpose AI chat**
> Tauri 2.x + React 19 + TypeScript + Vite | Multi-provider AI (OpenAI, Anthropic, Gemini, + 9 OpenAI-compatible)

## Architecture Overview

This is a **Tauri-based desktop app** with a clear separation between frontend (React/TypeScript) and backend (Rust). The frontend uses a **feature-based modular architecture** where each domain (chat, recording, history, etc.) is self-contained in `src/features/`.

### Critical Architecture Concepts

**Dual-layer separation:**
- Frontend: React components + business logic in `src/` and `/services/`
- Backend: Rust Tauri commands in `src-tauri/src/` for system-level operations (audio capture via ScreenCaptureKit, vector DB, local LLM, window management)

**Feature modules** (`src/features/*`) are the primary location for new code:
```
features/
├── chat/         # AI chat interface (ChatView + ChatPanel)
├── recording/    # Recording controls & state
├── history/      # Recording history sidebar
├── summary/      # Summary display
├── transcription/# Transcript view
├── notes/        # Meeting notes
├── todos/        # Task management
├── settings/     # Provider config, audio, categories, interface
└── [feature]/
    ├── components/   # Feature components
    ├── hooks/        # Feature hooks
    ├── context/      # Feature context (optional)
    └── index.ts      # Always export through here
```

**Context Provider Hierarchy** (defined in [AppProviders.tsx](src/app/AppProviders.tsx)):
```
ThemeProvider → ToastProvider → SettingsProvider → AppProvider →
 HistoryProvider → MeetingProvider → NotesProvider → TodosProvider →
ChatProvider → RecordingProvider
```
Order matters: outer providers are available to inner providers.

**Services Layer** (`/services/`) handles business logic:
- `unifiedAIService.ts` - Unified AI service routing to provider adapters
- `adapters/` - Provider-specific adapters (OpenAI, Anthropic, Gemini, OpenAI-compatible)
- `platform-fetch.ts` - Tauri HTTP transport (bypasses CORS via Rust reqwest)
- `storage/` - Tauri filesystem operations for recordings, transcriptions, summaries, history
- `tauri/` - Wrapper services for Tauri native APIs
- `migration/` - Data migration between versions (localStorage → filesystem)

**Rust Backend** (`src-tauri/`):
- `src/audio_core.rs` - Real-time audio capture via ScreenCaptureKit (system audio + microphone)
- `plugins/tauri-plugin-vectordb/` - sqlite-vec vector DB for meeting RAG
- `plugins/tauri-plugin-llamacpp/` - Local LLM inference via llama.cpp

## Development Workflow

### Essential Commands
```bash
npm run tauri:dev      # Full Tauri app (RECOMMENDED for dev)
npm run dev            # Vite only (frontend debugging)
npm run tauri:build    # Production build

npm test               # Run all tests (Vitest + RTL)
npm run test:watch     # Watch mode
npx vitest tests/unit/utils.test.ts  # Single test file
```

**Always use `npm run tauri:dev`** for development to test Rust backend integration. Frontend-only `npm run dev` won't have access to Tauri APIs.

### Testing Setup
- Framework: **Vitest** + **React Testing Library**
- Environment: jsdom
- Config: [vitest.config.ts](vitest.config.ts)
- Setup: [tests/setup.ts](tests/setup.ts)

## Code Conventions

### Import Patterns (CRITICAL)
**Always use path aliases** defined in [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts):

```typescript
// CORRECT
import { useApp } from '@shared/contexts/AppContext';
import { RecordingProvider, useRecording } from '@features/recording';
import { UI_CONFIG } from '@config/ui.config';
import { unifiedAIService } from '@/services/unifiedAIService';

// NEVER
import { useApp } from '../../../shared/contexts/AppContext';
import { RecordButton } from '@features/recording/components/RecordButton'; // Import from index.ts!
```

**Path alias mapping:**
```
@/*          → project root
@app/*       → src/app/*
@features/*  → src/features/*
@shared/*    → src/shared/*
@config/*    → src/config/*
@assets/*    → src/assets/*
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
- Use `UI_CONFIG` constants from [src/config/ui.config.ts](src/config/ui.config.ts)
- Dark mode: `dark:` prefix

```jsx
<div className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
```

## Key Integration Points

### Tauri Backend Commands
Rust commands exposed to frontend (grep for `#[tauri::command]` in `src-tauri/src/`):
- **Audio**: `start_recording`, `stop_recording`, `get_audio_sources` ([audio_core.rs](src-tauri/src/audio_core.rs))
- **Window**: `set_always_on_top`, `minimize_window` ([window.rs](src-tauri/src/window.rs))
- **Shortcuts**: `register_shortcut`, `unregister_shortcut` ([shortcuts.rs](src-tauri/src/shortcuts.rs))
- **Autostart**: `is_autostart_enabled`, `enable_autostart` ([autostart.rs](src-tauri/src/autostart.rs))

Frontend calls via services in `/services/tauri/`:
```typescript
import { windowService } from '@/services/tauri';
await windowService.setAlwaysOnTop(true);
```

### Multi-Provider AI Architecture
[services/unifiedAIService.ts](services/unifiedAIService.ts) routes to provider adapters:
- **Native SDK adapters**: `gemini.adapter.ts`, `openai.adapter.ts`, `anthropic.adapter.ts`
- **OpenAI-compatible adapter**: `openai-compat.adapter.ts` (Mistral, Groq, OpenRouter, Cohere, Azure, HuggingFace, xAI)
- **Local**: llama.cpp (via Tauri plugin), Local Server (Ollama/LM Studio/Jan)

Provider configuration is managed in Settings UI and stored encrypted at rest (AES-256-GCM).

HTTP transport uses `@tauri-apps/plugin-http` (Rust reqwest) to bypass CORS — never override `globalThis.fetch`.

### Storage Architecture
All data stored in Tauri app data directory (`~/Library/Application Support/ai.kasset.app/`):
- **Recordings** → `recordings/` (audio files)
- **Transcriptions** → `transcriptions/{id}.json`
- **Summaries** → `summaries/{id}.json`
- **Chats** → `chats/{id}.json`
- **History** → `history.json` (index of all recordings)
- **Settings** → `settings.json` (API keys encrypted)
- **Vector DB** → `vectordb.sqlite` (meeting RAG via sqlite-vec)

Services in [services/storage/](services/storage/) provide abstractions over Tauri file system APIs.

### Data Migration
[services/migration/](services/migration/) handles version upgrades:
- **V1 → V2**: localStorage → filesystem migration
- Automatically runs on app startup via `runMigrations()`

## Common Patterns

### Context Access
```typescript
// App state
const { status, setStatus, currentView } = useApp();

// Settings
const { settings, updateSettings } = useSettings();

// Recording (from feature)
const { startRecording, stopRecording, isRecording, status } = useRecordingContext();

// History
const { items, addToHistory, deleteItem } = useHistory();

// Notifications
const { success, error, warning } = useToast();
```

### Error Handling
```typescript
try {
  await performAction();
} catch (error: unknown) {
  console.error('[ComponentName] Action failed:', error);
  toast.error(error instanceof Error ? error.message : 'Operation failed');
}
```

### Adding a New Feature
1. Create folder in `src/features/feature-name/`
2. Structure: `components/`, `hooks/`, `context/`, `types/`, `index.ts`
3. Export public API through `index.ts`
4. Add provider to [AppProviders.tsx](src/app/AppProviders.tsx) if needed
5. Import via `@features/feature-name`

## Debugging

- **Console logs**: Use format `[ComponentName] Message:`, value
- **DevTools**: Available in `npm run tauri:dev` mode
- **Rust logs**: Check terminal running `npm run tauri:dev`
- **Package manager**: npm only (never pnpm)

---

For comprehensive details, see [AGENTS.md](../AGENTS.md)
