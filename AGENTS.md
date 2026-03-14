# Kasset AI - AI Agent Guidelines

> **macOS desktop app for real-time voice transcription and AI-powered summarization**
> Built with **Tauri 2.x + React 19 + TypeScript + Vite** • Powered by **Google Gemini AI**

---

## Commands

```bash
# Development
npm run dev              # Vite dev server (frontend only)
npm run tauri:dev        # Full Tauri app (recommended)

# Build
npm run build            # Production frontend build
npm run tauri:build      # Production Tauri app bundle

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
│   ├── features/                # ⭐ FEATURE MODULES (use for new code)
│   │   └── [feature]/
│   │       ├── components/      # Feature UI components
│   │       ├── hooks/           # Feature hooks
│   │       ├── context/         # Feature context (optional)
│   │       ├── types/           # Feature types
│   │       └── index.ts         # ⭐ Public exports (ALWAYS import from here)
│   ├── shared/                  # Cross-feature code (contexts, hooks, utils, types)
│   └── config/                  # App configuration (ui, audio, shortcuts, etc.)
├── services/                    # Business logic (geminiService, storage, tauri, migration)
├── tests/                       # Test files (Vitest + RTL)
└── src-tauri/                   # Rust backend

⚠️ LEGACY FOLDERS (DO NOT USE):
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
import { geminiService } from '@/services/geminiService';

// Bad
import { AppSettings } from '@/types'; // Should be 'import type'
```

### Import Conventions
**Path Aliases** (always use these, never `../../../`):
```typescript
import { useApp } from '@shared/contexts/AppContext';        // Shared contexts
import { RecordingProvider } from '@features/recording';     // Feature exports
import { UI_CONFIG } from '@config/ui.config';               // Config files
import { geminiService } from '@/services/geminiService';    // Root-level services
import { ProcessedResult } from '@/types';                   // Global types
```

**Available Aliases**: `@/*`, `@app/*`, `@features/*`, `@shared/*`, `@config/*`, `@assets/*`, `@core/*`, `@platform/*`

**Feature Module Rules**:
- ✅ Import from feature's `index.ts`: `import { ChatPanel } from '@features/chat'`
- ❌ Never import internal files: `import { ChatPanel } from '@features/chat/components/ChatPanel'`

### Naming Conventions
- **Components**: PascalCase - `SettingsPanel`, `ModelSettingsPanel`
- **Hooks**: camelCase with `use` prefix - `useApp`, `useRecordingContext`
- **Services**: camelCase with `Service` suffix - `geminiService`, `pathsService`
- **Config constants**: UPPER_SNAKE_CASE - `UI_CONFIG`, `MAX_AUDIO_SIZE_BYTES`
- **Types/Interfaces**: PascalCase - `AppSettings`, `HistoryItem`, `ProcessedResult`
- **Files**: kebab-case or PascalCase matching export - `ui.config.ts`, `SettingsPanel.tsx`

### Component Structure
```typescript
/**
 * Component documentation
 * Brief description of purpose and usage
 */

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
- `geminiService.ts` - Gemini AI transcription & chat
- `storage/` - Tauri file system operations
- `tauri/` - Tauri native APIs (window, tray, notifications)
- `migration/` - Data migration between versions

### Config Files (`src/config/`)
- `ui.config.ts` - UI constants, spacing, colors, breakpoints
- `audio.config.ts` - Audio settings, quality presets
- `shortcuts.config.ts` - Keyboard shortcuts
- `app.config.ts` - App metadata

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

### ✅ DO
- Use `src/features/` for new functionality
- Import via path aliases (`@features/`, `@shared/`, etc.)
- Export public APIs through feature's `index.ts`
- Use existing contexts for state management
- Use Tailwind + `UI_CONFIG` for styling
- Add JSDoc comments for complex components/functions
- Handle errors with proper types (`error: unknown`)
- Add tests for new functionality

### ❌ DON'T
- Add files to legacy folders (`/components/`, `/hooks/`, `/utils/`, `/consts/`)
- Create new global state without updating `AppProviders.tsx`
- Use inline styles or CSS modules
- Import internal feature files directly (use `index.ts`)
- Use `any` type without strong justification
- Use relative imports (`../../../`) - use path aliases instead
- Skip error handling in async functions

---

## Debugging

- **Console logs**: Use format `[ComponentName] Message:`, value
- **DevTools**: Available in `npm run tauri:dev` mode
- **Rust logs**: Check terminal running `npm run tauri:dev`
- **Test debugging**: Add `.only` to focus single test: `it.only('test', ...)`
