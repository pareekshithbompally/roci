# Kasset AI - AI Agent Guidelines

> **macOS meeting intelligence app — private, local-first, with built-in general-purpose AI chat**
> Built with **Tauri 2.x + React 19 + TypeScript + Vite** | Multi-provider AI (OpenAI, Anthropic, Gemini, + 9 OpenAI-compatible)

---

## Commands

```bash
# Development
npm run dev              # Vite dev server (frontend only)
npm run tauri:dev        # Full Tauri app (recommended)

# Build
npm run build            # Production frontend build
npm run tauri:build      # Production Tauri app bundle (.dmg)

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npx vitest tests/unit/utils.test.ts           # Single test file
npx vitest tests/unit/utils.test.ts -t "name" # Specific test by name
```

---

## Project Architecture

```
kasset-ai/
├── types.ts                     # Global types (AppStatus, HistoryItem, etc.)
├── src/
│   ├── app/                     # App bootstrap (App.tsx, AppProviders.tsx)
│   ├── features/                # FEATURE MODULES (use for new code)
│   │   └── [feature]/
│   │       ├── components/      # Feature UI components
│   │       ├── hooks/           # Feature hooks
│   │       ├── context/         # Feature context (optional)
│   │       ├── types/           # Feature types
│   │       └── index.ts         # Public exports (ALWAYS import from here)
│   ├── shared/                  # Cross-feature code (contexts, hooks, utils, types)
│   └── config/                  # App configuration (ui, audio, shortcuts, etc.)
├── services/                    # Business logic layer
│   ├── unifiedAIService.ts      # Unified AI routing to provider adapters
│   ├── adapters/                # Provider adapters (OpenAI, Anthropic, Gemini, OpenAI-compat)
│   ├── platform-fetch.ts        # Tauri HTTP transport (CORS bypass via Rust reqwest)
│   ├── storage/                 # Tauri filesystem operations (encrypted settings)
│   ├── tauri/                   # Tauri native APIs (window, tray, notifications)
│   ├── providers/               # Provider configuration and defaults
│   └── migration/               # Data migration between versions
├── tests/                       # Test files (Vitest + RTL)
├── scripts/                     # Build helpers (Swift runtime bundling)
└── src-tauri/                   # Rust backend
    ├── src/
    │   ├── audio_core.rs        # ScreenCaptureKit audio capture (system + mic)
    │   ├── window.rs            # Window management
    │   ├── shortcuts.rs         # Global shortcuts
    │   └── autostart.rs         # Login item management
    └── plugins/
        ├── tauri-plugin-vectordb/   # sqlite-vec vector DB (meeting RAG)
        └── tauri-plugin-llamacpp/   # Local LLM inference

LEGACY FOLDERS (DO NOT USE):
/components/, /hooks/, /utils/, /consts/ → Use src/features/* or src/shared/* instead
```

---

## Code Style Guidelines

### TypeScript Rules
- **Always use TypeScript**, never plain JS
- **Avoid `any`** - use `unknown` when type is truly unknown
- **Interfaces vs Types**: `interface` for public APIs, `type` for unions/intersections
- **Type-only imports**: Use `import type { }` for types

```typescript
// Good
import type { AppSettings } from '@/types';
import { unifiedAIService } from '@/services/unifiedAIService';

// Bad
import { AppSettings } from '@/types'; // Should be 'import type'
```

### Import Conventions
**Path Aliases** (always use these, never `../../../`):
```typescript
import { useApp } from '@shared/contexts/AppContext';        // Shared contexts
import { RecordingProvider } from '@features/recording';     // Feature exports
import { UI_CONFIG } from '@config/ui.config';               // Config files
import { unifiedAIService } from '@/services/unifiedAIService'; // Root-level services
import { ProcessedResult } from '@/types';                   // Global types
```

**Available Aliases**: `@/*`, `@app/*`, `@features/*`, `@shared/*`, `@config/*`, `@assets/*`, `@core/*`, `@platform/*`

**Feature Module Rules**:
- Import from feature's `index.ts`: `import { ChatPanel } from '@features/chat'`
- Never import internal files: `import { ChatPanel } from '@features/chat/components/ChatPanel'`

### Naming Conventions
- **Components**: PascalCase - `SettingsPanel`, `ModelSettingsPanel`
- **Hooks**: camelCase with `use` prefix - `useApp`, `useRecordingContext`
- **Services**: camelCase with `Service` suffix - `unifiedAIService`, `pathsService`
- **Config constants**: UPPER_SNAKE_CASE - `UI_CONFIG`, `MAX_AUDIO_SIZE_BYTES`
- **Types/Interfaces**: PascalCase - `AppSettings`, `HistoryItem`, `ProcessedResult`
- **Files**: kebab-case or PascalCase matching export - `ui.config.ts`, `SettingsPanel.tsx`

### Component Structure
```typescript
import React, { useCallback, useState } from 'react';
import type { ComponentProps } from './types';
import { useApp } from '@shared/contexts/AppContext';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  const { status } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = useCallback(() => {
    onAction();
  }, [onAction]);

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950">
      {/* JSX */}
    </div>
  );
};
```

### Styling
- **Tailwind CSS only** - no CSS modules, no inline styles
- Use `UI_CONFIG` constants for consistent values
- Dark mode: always add `dark:` variants
- Standard color palette: `zinc-*` for backgrounds/text

```tsx
<div className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 rounded-lg">
```

### Error Handling
```typescript
try {
  await performAction();
} catch (error: unknown) {
  console.error('[ComponentName] Operation failed:', error);
  setError(error instanceof Error ? error.message : 'Operation failed');
}
```

### Console Logging
Use consistent format: `console.log('[ComponentName] Description:', value)`

---

## Key Contexts & Services

### React Contexts (`src/shared/contexts/`)
| Context | Hook | Purpose |
|---------|------|---------|
| `AppContext` | `useApp()` | View state, status, result display |
| `SettingsContext` | `useSettings()` | User settings & preferences |
| `HistoryContext` | `useHistory()` | Recording history management |
| `ToastContext` | `useToast()` | Notification system |
| `MeetingContext` | `useMeeting()` | Current meeting/recording data |
| `ChatContext` | `useChat()` | AI chat interface state |
| `ThemeContext` | `useTheme()` | Theme preferences |

### Services (`/services/`)
- `unifiedAIService.ts` - Routes AI requests to the correct provider adapter
- `adapters/` - Provider-specific implementations (Gemini, OpenAI, Anthropic, OpenAI-compatible)
- `platform-fetch.ts` - CORS-free HTTP via Tauri plugin-http (Rust reqwest)
- `storage/` - Tauri file system operations (settings encrypted via AES-256-GCM)
- `tauri/` - Tauri native APIs (window, tray, notifications)
- `migration/` - Data migration between versions
- `meetingReferenceService.ts` - Meeting context for RAG

### Config Files (`src/config/`)
- `ui.config.ts` - UI constants, spacing, colors, breakpoints
- `audio.config.ts` - Audio settings, quality presets
- `shortcuts.config.ts` - Keyboard shortcuts
- `app.config.ts` - App metadata

---

## Multi-Provider AI Architecture

### Supported Providers
| Provider | Adapter | Transport |
|----------|---------|-----------|
| Google Gemini | `gemini.adapter.ts` (native `@google/genai`) | Tauri HTTP |
| OpenAI | `openai.adapter.ts` (native `openai` SDK) | Tauri HTTP |
| Anthropic | `anthropic.adapter.ts` (native `@anthropic-ai/sdk`) | Tauri HTTP |
| Mistral, Groq, OpenRouter, Cohere, Azure, HuggingFace, xAI | `openai-compat.adapter.ts` | Tauri HTTP |
| Llama.cpp | Tauri plugin (Rust) | Local |
| Local Server (Ollama, LM Studio, Jan) | `openai-compat.adapter.ts` | Direct fetch |

### CORS Transport
Browser `fetch()` causes CORS failures for most providers. All SDK HTTP goes through `@tauri-apps/plugin-http` (Rust reqwest). Key rules:
- **Never override `globalThis.fetch`** — breaks Vite HMR and WebView internals
- Inject via SDK `fetch:` parameter (OpenAI, Anthropic support this)
- Clear client cache after changing fetch config: `clearClientCache()`

### Provider Configuration
- Configured in Settings UI, stored in `settings.json`
- API keys encrypted at rest (AES-256-GCM, device-specific key)
- Provider definitions in `consts/providers.ts`

---

## Audio Capture (Rust Backend)

Uses **ScreenCaptureKit** (no third-party drivers like BlackHole needed):
- Captures at 48kHz native SCK rate, resamples to 16kHz for output
- Three modes: System audio, Microphone, System + Microphone
- 32-bit float, little-endian, mono
- Output: WAV format stored in app data directory
- Key file: `src-tauri/src/audio_core.rs`

---

## Meeting RAG (Vector Search)

- **sqlite-vec** via Rust plugin `tauri-plugin-vectordb`
- Hybrid search: KNN vector + FTS5 full-text, merged via Reciprocal Rank Fusion
- Embeddings: WASM-side via Transformers.js (all-MiniLM-L6-v2, 384-dim)
- Chunking: Sentence-boundary splitting with overlap (`extensions/rag/chunker.ts`)
- Staleness: SHA-256 content hashing — only re-indexes changed meetings

---

## Testing

**Framework**: Vitest + React Testing Library
**Environment**: jsdom
**Setup**: `/tests/setup.ts`

```bash
npm test                              # All tests
npm run test:watch                    # Watch mode
npm run test:coverage                 # Coverage report
npx vitest tests/unit/utils.test.ts  # Single file
npx vitest -t "test name"             # Specific test
```

**Test Structure**:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  it('should render correctly', () => {
    // Test implementation
  });
});
```

---

## Critical Rules

### DO
- Use `src/features/` for new functionality
- Import via path aliases (`@features/`, `@shared/`, etc.)
- Export public APIs through feature's `index.ts`
- Use existing contexts for state management
- Use Tailwind + `UI_CONFIG` for styling
- Handle errors with proper types (`error: unknown`)
- Use npm as package manager (never pnpm)

### DON'T
- Add files to legacy folders (`/components/`, `/hooks/`, `/utils/`, `/consts/`)
- Create new global state without updating `AppProviders.tsx`
- Use inline styles or CSS modules
- Import internal feature files directly (use `index.ts`)
- Use `any` type without strong justification
- Use relative imports (`../../../`) - use path aliases instead
- Override `globalThis.fetch` in Tauri WebView
- Skip error handling in async functions

---

## Debugging

- **Console logs**: Use format `[ComponentName] Message:`, value
- **DevTools**: Available in `npm run tauri:dev` mode
- **Rust logs**: Check terminal running `npm run tauri:dev`
- **Test debugging**: Add `.only` to focus single test: `it.only('test', ...)`
